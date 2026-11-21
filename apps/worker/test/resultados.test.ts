import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClienteHttpEducado, horarioSP, type FonteBoloes } from '@radar/core';
import { describe, expect, it } from 'vitest';
import { Coletor } from '../src/coletor';
import { criarBuscaResultados } from '../src/fontes/resultados-caixa';
import { logMudo } from '../src/log';
import { RelogioManual } from '../src/relogio';
import { RepositorioMemoria } from '../src/repositorio/memoria';

const JSON_3088 = readFileSync(join(import.meta.dirname, '..', '..', '..', 'packages', 'core', 'fonte', 'fixtures', 'resultados', 'megasena-3088.json'), 'utf8');

function clienteFalso(respostas: Record<string, { status: number; corpo: string }>) {
  const pedidas: string[] = [];
  const http = new ClienteHttpEducado({
    intervaloMinimoMs: 0,
    dormir: async () => {},
    fetch: (async (url: string) => {
      pedidas.push(url);
      const r = respostas[url] ?? { status: 404, corpo: '{}' };
      return new Response(r.corpo, { status: r.status, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch,
  });
  return { http, pedidas };
}

describe('resultado oficial (API pública da CAIXA)', () => {
  it('busca /portaldeloterias/api/megasena/3088 e normaliza', async () => {
    const { http, pedidas } = clienteFalso({ 'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/3088': { status: 200, corpo: JSON_3088 } });
    const r = await criarBuscaResultados(http)({ modalidade: 'mega-sena', concurso: 3088 });
    expect(pedidas).toEqual(['https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/3088']);
    expect(r!.resultado.dezenas).toEqual([10, 21, 24, 28, 34, 44]);
    expect(await criarBuscaResultados(http)({ modalidade: 'mega-sena', concurso: 3089 })).toBeNull(); // 404 = ainda não saiu
  });

  it('o coletor busca, a cada 10 min, o resultado de concursos já sorteados', async () => {
    const repo = new RepositorioMemoria();
    await repo.salvarConcursos([{ modalidade: 'mega-sena', concurso: 3088, origem: 'fonte' }]);
    const relogio = new RelogioManual(horarioSP(2026, 11, 20, 12, 0).getTime());
    await repo.marcarEncerrado({ modalidade: 'mega-sena', concurso: 3088 }, horarioSP(2026, 11, 19, 20, 0));
    const { http, pedidas } = clienteFalso({ 'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/3088': { status: 200, corpo: JSON_3088 } });
    const vazia: FonteBoloes = { nome: 'vazia', concursosAbertos: async () => [], contagens: async () => [], pagina: async () => { throw new Error('x'); } };
    const coletor = new Coletor({ fonte: vazia, repo, relogio, log: logMudo, resultados: criarBuscaResultados(http) });
    const contagens = { tipo: 'contagens' as const, chave: 'contagens', slot: 1, agendadaPara: relogio.agora(), prioridade: 3 };
    await coletor.executar(contagens);
    expect(repo.resultados.get('mega-sena#3088')?.dezenas).toEqual([10, 21, 24, 28, 34, 44]);
    await coletor.executar(contagens); // menos de 10 min depois: não busca de novo
    expect(pedidas).toHaveLength(1);
  });
});
