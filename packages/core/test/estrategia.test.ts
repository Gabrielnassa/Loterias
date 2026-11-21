import { describe, expect, it } from 'vitest';
import { planejarLeitura, resumoFilas } from '../coleta/estrategia';
import { aplicarLeitura, novoEstadoConcurso } from '../eventos/estado';
import { FonteSimulada, gerarAberturaSimulada, leituraSimulada } from '../simulacao';
import { lerPaginas } from '../fonte/varredura';
import { horarioSP } from '../tempo/fuso';

const base = { agora: 100_000, intervaloMs: 5000, ultimaCompletaEm: 90_000, boloesFila1: 0, totalVisiveis: 0 };

describe('estratégia de leitura na abertura', () => {
  it('completa enquanto a leitura completa couber no intervalo (e sempre na 1ª vez)', () => {
    expect(planejarLeitura({ ...base, duracaoUltimaCompletaMs: null, ultimaCompletaEm: null })).toEqual({ tipo: 'completa' });
    expect(planejarLeitura({ ...base, duracaoUltimaCompletaMs: 4200 })).toEqual({ tipo: 'completa' });
  });

  it('passou de 5 s: só as páginas onde termina a 1ª fila (+1 de margem)', () => {
    // 1ª fila com 75 bolões: termina na pág. 3 (posições 61-75); o próximo entra na posição 76 (pág. 3)
    expect(planejarLeitura({ ...base, duracaoUltimaCompletaMs: 9000, boloesFila1: 75, totalVisiveis: 400 })).toEqual({ tipo: 'borda', paginas: [3, 4] });
    // 1ª fila fechando a pág. 2 exatamente: o próximo vai para a pág. 3
    expect(planejarLeitura({ ...base, duracaoUltimaCompletaMs: 9000, boloesFila1: 60, totalVisiveis: 400 })).toEqual({ tipo: 'borda', paginas: [2, 3, 4] });
  });

  it('mesmo no modo borda, uma leitura completa a cada 60 s', () => {
    expect(planejarLeitura({ ...base, agora: 150_001, duracaoUltimaCompletaMs: 9000, boloesFila1: 75, totalVisiveis: 400 })).toEqual({ tipo: 'completa' });
  });

  it('resumo das filas e leitura só das páginas da borda acham os bolões novos', async () => {
    const T0 = horarioSP(2026, 11, 16, 21, 45);
    const sim = gerarAberturaSimulada({ semente: 5, t0: T0, nBoloes: 200 });
    const t1 = new Date(T0.getTime() + 3 * 60_000);
    const estado = novoEstadoConcurso(sim);
    aplicarLeitura(estado, leituraSimulada(sim, t1));
    const { boloesFila1, totalVisiveis } = resumoFilas(estado);
    expect(boloesFila1).toBeGreaterThan(30);
    const plano = planejarLeitura({ ...base, duracaoUltimaCompletaMs: 9000, boloesFila1, totalVisiveis });
    expect(plano.tipo).toBe('borda');
    const t2 = new Date(t1.getTime() + 5000);
    const leitura = await lerPaginas(new FonteSimulada([sim], () => t2), sim, plano.tipo === 'borda' ? plano.paginas : []);
    expect(leitura.completa).toBe(false);
    // todos os 1ºs bolões que chegaram entre t1 e t2 estão nas páginas lidas
    const novos1aFila = sim.boloes.filter((b) => b.fila === 1 && b.chegadaEm > t1 && b.chegadaEm <= t2).map((b) => b.bolao.idCaixa);
    const lidos = new Set(leitura.itens.map((i) => i.idCaixa));
    for (const id of novos1aFila) expect(lidos.has(id)).toBe(true);
    // posição observada vem da página
    const p = plano.tipo === 'borda' ? plano.paginas[0]! : 1;
    expect(leitura.itens[0]!.posicaoObservada).toBe((p - 1) * 30 + 1);
  });
});
