import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conferirBolao, premioDaAposta, velocidadeNaAbertura } from '../conferencia/premios';
import { normalizarResultadoCaixa, type ResultadoOficial } from '../conferencia/resultado';
import { FormatoInesperadoError } from '../fonte/erros';

const MEGA_3088 = normalizarResultadoCaixa(JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fonte', 'fixtures', 'resultados', 'megasena-3088.json'), 'utf8')));

describe('resultado oficial da CAIXA (Mega-Sena 3.088, JSON real)', () => {
  it('normaliza dezenas, data e rateio', () => {
    expect(MEGA_3088).toMatchObject({ modalidade: 'mega-sena', concurso: 3088, dataApuracao: '2026-11-19', dezenas: [10, 21, 24, 28, 34, 44], acumulado: true });
    expect(MEGA_3088.rateios).toEqual([
      { faixa: 1, descricao: '6 acertos', acertos: 6, ganhadores: 0, valorPremio: 0 },
      { faixa: 2, descricao: '5 acertos', acertos: 5, ganhadores: 15, valorPremio: 93739.59 },
      { faixa: 3, descricao: '4 acertos', acertos: 4, ganhadores: 2750, valorPremio: 730.43 },
    ]);
  });
  it('rejeita formato inesperado', () => {
    expect(() => normalizarResultadoCaixa({ numero: 1 })).toThrow(FormatoInesperadoError);
  });
});

describe('prêmio de uma aposta (combinatória)', () => {
  it('aposta simples com 4 acertos = 1 quadra', () => {
    const p = premioDaAposta([10, 21, 24, 28, 1, 2], MEGA_3088)!;
    expect(p.acertos).toBe(4);
    expect(p.faixas).toEqual([{ sorteio: 1, faixa: 3, descricao: '4 acertos', acertos: 4, quantidade: 1, valorUnitario: 730.43, valor: 730.43 }]);
  });
  it('9 números com 5 acertos = 4 quinas + 30 quadras', () => {
    const p = premioDaAposta([10, 21, 24, 28, 34, 1, 2, 3, 4], MEGA_3088)!;
    expect(p.faixas.map((f) => [f.acertos, f.quantidade])).toEqual([[5, 4], [4, 30]]); // C(5,5)C(4,1) e C(5,4)C(4,2)
    expect(p.total).toBe(Math.round((4 * 93739.59 + 30 * 730.43) * 100) / 100);
  });
  it('3 acertos não premiam na Mega', () => {
    expect(premioDaAposta([10, 21, 24, 1, 2, 3], MEGA_3088)!.total).toBe(0);
  });
  it('Lotofácil: 16 números com 14 acertos', () => {
    const r: ResultadoOficial = {
      modalidade: 'lotofacil', concurso: 1, dataApuracao: '2026-11-20', acumulado: false,
      dezenas: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      rateios: [15, 14, 13, 12, 11].map((a, i) => ({ faixa: i + 1, descricao: `${a} acertos`, acertos: a, ganhadores: 1, valorPremio: [1e6, 1500, 30, 12, 6][i]! })),
    };
    const p = premioDaAposta([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20, 21], r)!;
    // h = 14 de 16: C(14,14)C(2,1)=2 de 14 acertos; C(14,13)C(2,2)=14 de 13 acertos
    expect(p.faixas.map((f) => [f.acertos, f.quantidade])).toEqual([[14, 2], [13, 14]]);
  });
});

describe('conferência do bolão', () => {
  it('seu prêmio = prêmio total / cotas totais x cotas que sobraram', () => {
    const c = conferirBolao([[10, 21, 24, 28, 1, 2], [3, 4, 5, 6, 7, 8]], MEGA_3088, 10, 3)!;
    expect(c.premioTotal).toBe(730.43);
    expect(c.premioLoterica).toBe(219.13); // 730,43 / 10 x 3
    expect(c.premioPorCota).toBe(73.04);
  });
});

describe('abriu rápido?', () => {
  it('rápido até 21:46, médio até 21:47, lento depois', () => {
    expect(velocidadeNaAbertura(5)).toBe('rapido');
    expect(velocidadeNaAbertura(59.9)).toBe('rapido');
    expect(velocidadeNaAbertura(60)).toBe('medio');
    expect(velocidadeNaAbertura(130)).toBe('lento');
  });
});
