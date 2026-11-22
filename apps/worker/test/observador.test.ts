import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { horarioSP, type FonteBoloes } from '@radar/core';
import { FonteSimulada, gerarAberturaSimulada } from '@radar/core/simulacao';
import { describe, expect, it } from 'vitest';
import { observarAbertura } from '../src/observador';
import { RelogioManual } from '../src/relogio';

const T0 = horarioSP(2026, 11, 22, 11, 45);

describe('observar abertura (script da etapa C)', () => {
  it('grava cada página e cada leitura em JSONL e resume quando a leitura completa passou de 5 s', async () => {
    const sim = gerarAberturaSimulada({ semente: 8, t0: T0, nBoloes: 200, modalidade: 'mega-sena', concurso: 3090 });
    const relogio = new RelogioManual(T0.getTime() - 3 * 60_000);
    const base = new FonteSimulada([sim], () => relogio.agora());
    // cada página custa 1,5 s (como um navegador com ritmo baixo)
    const fonte: FonteBoloes = {
      nome: 'simulada-lenta',
      concursosAbertos: () => base.concursosAbertos(),
      contagens: () => base.contagens(),
      pagina: async (c) => {
        relogio.avancar(1500);
        return base.pagina(c);
      },
    };
    const saida = join(mkdtempSync(join(tmpdir(), 'obs-')), 'abertura.jsonl');
    const resumo = await observarAbertura({
      fonte,
      modalidade: 'mega-sena',
      t0: T0,
      duracaoMs: 8 * 60_000,
      saida,
      agora: () => relogio.agora(),
      dormir: async (ms) => relogio.avancar(ms),
    });
    const linhas = readFileSync(saida, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(linhas[0]).toMatchObject({ tipo: 'inicio', modalidade: 'mega-sena', t0: T0.toISOString() });
    const paginas = linhas.filter((l) => l.tipo === 'pagina');
    const leituras = linhas.filter((l) => l.tipo === 'leitura' && l.concurso);
    expect(paginas.length).toBeGreaterThan(leituras.length);
    expect(paginas[0]).toEqual(expect.objectContaining({ pagina: 1, duracaoMs: 1500, ok: true }));
    expect(leituras.every((l) => typeof l.duracaoMs === 'number' && typeof l.paginas === 'number' && l.proximoPlano)).toBe(true);
    // concurso novo detectado sozinho quando abriu
    expect(resumo.concurso).toBe(3090);
    expect(resumo.primeiroBolaoEmS).toBeGreaterThanOrEqual(0);
    // com 1,5 s por página, a leitura completa passa de 5 s quando chega a 4 páginas (91+ bolões)
    expect(resumo.passouDoIntervaloEmS).not.toBeNull();
    expect(resumo.paginasQuandoPassou).toBe(4);
    expect(resumo.leiturasAcimaDoIntervalo).toBeGreaterThan(0);
    expect(linhas.at(-1)).toMatchObject({ tipo: 'resumo', leituras: resumo.leituras });
  });
});

describe('analisar a gravação de uma abertura (ordem dentro da fila)', () => {
  it('chegada em ordem na 1ª fila => recomenda fila-chegada; embaralhada => fila-aleatoria', async () => {
    const { analisarGravacao } = await import('../src/analisar-abertura');
    const linha = (leitura: number, pagina: number, inicio: string, ordem: [number, number][]) => JSON.stringify({ tipo: 'pagina', leitura, pagina, inicio, ordem });
    // leitura 1 vê 3 bolões; leitura 2 vê mais 3 chegando depois, todos na fila 1, na ordem de chegada
    const emOrdem = [
      linha(1, 1, '2026-11-22T14:45:05Z', [[1, 1], [2, 1], [3, 1]]),
      linha(2, 1, '2026-11-22T14:45:10Z', [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]]),
    ].join('\n');
    expect(analisarGravacao(emOrdem).resumo.leitura).toMatch(/fila-chegada/);
    const embaralhada = [
      linha(1, 1, '2026-11-22T14:45:05Z', [[1, 1], [2, 1], [3, 1]]),
      linha(2, 1, '2026-11-22T14:45:10Z', [[5, 1], [2, 1], [6, 1], [1, 1], [4, 1], [3, 1]]),
    ].join('\n');
    const r = analisarGravacao(embaralhada);
    expect(r.resumo.leitura).toMatch(/fila-aleatoria/);
    expect(r.leituras[1]!.diagnostico.itens).toBe(6);
  });
});
