import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colunasSuperSeteValidas, conferirJogo, premioDaAposta, REGRAS_CONFERENCIA } from '../conferencia/premios';
import { colunasPadraoSuperSete, probabilidadesDoJogo } from '../conferencia/probabilidade';
import { normalizarResultadoCaixa, type ResultadoOficial } from '../conferencia/resultado';
import type { ColunaLoteca } from '../dominio/jogo';
import type { ModalidadeSlug } from '../dominio/modalidades';

/**
 * Regras e faixas OFICIAIS (páginas loterias.caixa.gov.br/Paginas/{Modalidade}.aspx, 21/11/2026):
 * tabelas de probabilidade e de quantidade de prêmios copiadas da CAIXA, e uma aposta que cai em
 * cada faixa de cada modalidade, conferida contra o rateio REAL do concurso.
 */
function fixture(nome: string) {
  return normalizarResultadoCaixa(JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fonte', 'fixtures', 'resultados', `${nome}.json`), 'utf8')));
}
const R: Record<string, ResultadoOficial> = {
  'mega-sena': fixture('megasena-3088'),
  quina: fixture('quina-7172'),
  lotofacil: fixture('lotofacil-3834'),
  'dupla-sena': fixture('duplasena-3034'),
  lotomania: fixture('lotomania-3001'),
  timemania: fixture('timemania-2470'),
  'dia-de-sorte': fixture('diadesorte-1352'),
  'mais-milionaria': fixture('maismilionaria-408'),
  'super-sete': fixture('supersete-sintetico'),
  loteca: fixture('loteca-1283'),
};

/** "1 em X" calculado bate com o publicado (a CAIXA arredonda ou trunca: diferença menor que 1). */
function bate(modalidade: ModalidadeSlug, formato: Parameters<typeof probabilidadesDoJogo>[1], oficial: (number | null)[]) {
  const calc = probabilidadesDoJogo(modalidade, formato).map((f) => f.umEm);
  oficial.forEach((o, i) => {
    if (o === null) expect(calc[i]).toBe(Infinity);
    else expect(Math.abs(calc[i]! - o), `${modalidade} ${JSON.stringify(formato)} faixa ${i + 1}: ${calc[i]} x ${o}`).toBeLessThan(Math.max(1, o * 1e-6));
  });
}

describe('probabilidades = tabelas oficiais da CAIXA', () => {
  it('Mega-Sena (6 a 20 números): sena, quina, quadra', () => {
    const t: [number, number, number, number][] = [
      [6, 50_063_860, 154_518, 2_332], [7, 7_151_980, 44_981, 1_038], [8, 1_787_995, 17_192, 539], [9, 595_998, 7_791, 312],
      [10, 238_399, 3_973, 195], [11, 108_363, 2_211, 129], [12, 54_182, 1_317, 90], [13, 29_175, 828, 65], [14, 16_671, 544, 48],
      [15, 10_003, 370, 37], [16, 6_252, 260, 29], [17, 4_045, 188, 23], [18, 2_697, 139, 19], [19, 1_845, 105, 16], [20, 1_292, 81, 13],
    ];
    for (const [n, ...o] of t) bate('mega-sena', { numeros: n }, o);
  });
  it('Quina (5 a 15 números): quina, quadra, terno, duque', () => {
    const t: number[][] = [
      [5, 24_040_016, 64_106, 866, 36], [6, 4_006_669, 21_658, 445, 25], [7, 1_144_763, 9_409, 261, 18], [8, 429_286, 4_770, 168, 14],
      [9, 190_794, 2_687, 115, 12], [10, 95_396, 1_635, 82, 9], [11, 52_035, 1_056, 62, 8], [12, 30_354, 714, 48, 7],
      [13, 18_679, 502, 38, 6], [14, 12_008, 364, 31, 5.8], [15, 8_005, 271, 25, 5.2],
    ];
    for (const [n, ...o] of t) bate('quina', { numeros: n! }, o);
  });
  it('Lotofácil (15 a 20 números): 15 a 11 acertos', () => {
    const porN: Record<number, number[]> = {
      15: [3_268_760, 21_792, 692, 60, 11], 16: [204_298, 3_027, 162, 21, 6], 17: [24_035, 601, 49, 9, 4],
      18: [4_006, 153, 18, 5, 3], 19: [843, 47, 8, 3.2, 2.9], 20: [211, 17, 4.2, 2.6, 3.9],
    };
    for (const [n, o] of Object.entries(porN)) bate('lotofacil', { numeros: Number(n) }, o);
  });
  it('Dupla Sena (6 a 15 números), por sorteio: sena, quina, quadra, terno', () => {
    const t: number[][] = [
      [6, 15_890_700, 60_192, 1_120, 60], [7, 2_270_100, 17_597, 502, 37], [8, 567_525, 6_756, 263, 25], [9, 189_175, 3_076, 153, 18],
      [10, 75_670, 1_576, 97, 13], [11, 34_395, 881, 64, 11], [12, 17_197, 528, 45, 9], [13, 9_260, 333, 33, 7],
      [14, 5_291, 220, 25, 6], [15, 3_174, 151, 19, 5],
    ];
    for (const [n, ...o] of t) bate('dupla-sena', { numeros: n! }, o);
  });
  it('Dia de Sorte (7 a 15 números): 7 a 4 acertos e Mês de Sorte (1 em 12)', () => {
    const colunas: Record<number, number[]> = {
      7: [2_629_575, 15_652, 453, 37], 8: [328_696, 4_083, 185, 21], 9: [73_043, 1_422, 90, 13], 10: [21_913, 596, 49, 9],
      11: [7_968, 284, 29, 6], 12: [3_320, 149, 19, 5], 13: [1_532, 85, 13, 4], 14: [766, 51, 9, 3], 15: [408, 32, 7, 3],
    };
    for (const [n, o] of Object.entries(colunas)) bate('dia-de-sorte', { numeros: Number(n) }, [...o, 12]);
  });
  it('Timemania: 7 a 3 números e Time do Coração (1 em 80)', () => {
    bate('timemania', {}, [26_472_637, 216_103, 5_220, 276, 29, 80]);
  });
  it('Lotomania: 20 a 15 e 0 acertos', () => {
    bate('lotomania', {}, [11_372_635, 352_551, 24_235, 2_776, 472, 112, 11_372_635]);
  });
  it('Super Sete (7 a 21 números): 7 a 3 colunas', () => {
    const t: number[][] = [
      [7, 10_000_000, 158_730, 5_879, 392, 43.5], [8, 5_000_000, 86_207, 3_494, 257, 31.9], [9, 2_500_000, 47_170, 2_108, 173, 24.0],
      [10, 1_250_000, 26_042, 1_294, 119, 18.6], [11, 625_000, 14_535, 811, 84, 14.8], [12, 312_500, 8_224, 520, 61, 12.1],
      [13, 156_250, 4_735, 343, 45, 10.2], [14, 78_125, 2_790, 233, 35, 8.7], [15, 52_083, 1_978, 176, 28, 7.6],
      [16, 34_722, 1_408, 134, 23, 6.8], [17, 23_148, 1_006, 103, 19, 6.1], [18, 15_432, 723, 80, 16, 5.5],
      [19, 10_288, 523, 63, 14, 5.1], [20, 6_859, 381, 50, 12, 4.7], [21, 4_572, 280, 40, 10, 4.4],
    ];
    for (const [n, ...o] of t) bate('super-sete', { numeros: n! }, o);
  });
  it('+Milionária: as 10 faixas para 6+2, 6+6 e 7+2', () => {
    bate('mais-milionaria', { numeros: 6, trevos: 2 }, [238_360_500, 17_025_750, 902_881, 64_491, 16_798, 1_200, 900, 112, 117, 15]);
    // com os 6 trevos marcados sempre se acertam os 2: as faixas "1 ou nenhum trevo" ficam impossíveis
    bate('mais-milionaria', { numeros: 6, trevos: 6 }, [15_890_700, null, 60_192, null, 1_120, null, 60, null, 8, null]);
    bate('mais-milionaria', { numeros: 7, trevos: 2 }, [34_051_500, 2_432_250, 263_965, 18_855, 7_542, 539, 552, 69, 92, 11]);
  });
  it('Loteca: aposta mínima (1 duplo) e máxima (3 triplos e 5 duplos = 864 apostas)', () => {
    const marc = (t: number, d: number) => Array.from({ length: 14 }, (_, i) => (i < t ? 3 : i < t + d ? 2 : 1));
    bate('loteca', { marcacoesLoteca: marc(0, 1) }, [2_391_485, 85_410]);
    bate('loteca', { marcacoesLoteca: marc(3, 5) }, [5_536, 198]);
  });
});

describe('quantidade de prêmios = tabelas oficiais', () => {
  it('Dia de Sorte: prêmios por faixa para 7 a 15 números e cada número de acertos', () => {
    // [n, acertando 7: f1..f4, acertando 6: f2..f4, acertando 5: f3, f4, acertando 4: f4, Mês de Sorte]
    const t: number[][] = [
      [7, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1], [8, 1, 7, 0, 0, 2, 6, 0, 3, 5, 4, 8], [9, 1, 14, 21, 0, 3, 18, 15, 6, 20, 10, 36],
      [10, 1, 21, 63, 35, 4, 36, 60, 10, 50, 20, 120], [11, 1, 28, 126, 140, 5, 60, 150, 15, 100, 35, 330],
      [12, 1, 35, 210, 350, 6, 90, 300, 21, 175, 56, 792], [13, 1, 42, 315, 700, 7, 126, 525, 28, 280, 84, 1_716],
      [14, 1, 49, 441, 1_225, 8, 168, 840, 36, 420, 120, 3_432], [15, 1, 56, 588, 1_960, 9, 216, 1_260, 45, 600, 165, 6_435],
    ];
    const r = R['dia-de-sorte']!;
    const sorteadas = r.dezenas;
    const fora = Array.from({ length: 31 }, (_, i) => i + 1).filter((x) => !sorteadas.includes(x));
    const qtd = (n: number, h: number, mes: number) => {
      const p = premioDaAposta({ numeros: [...sorteadas.slice(0, h), ...fora.slice(0, n - h)], mesSorte: mes }, r)!;
      const por = (faixa: number) => p.faixas.find((f) => f.faixa === faixa)?.quantidade ?? 0;
      return [1, 2, 3, 4, 5].map(por);
    };
    for (const [n, a1, a2, a3, a4, b2, b3, b4, c3, c4, d4, mes] of t) {
      expect(qtd(n!, 7, 1).slice(0, 4)).toEqual([a1, a2, a3, a4]);
      expect(qtd(n!, 6, 1).slice(1, 4)).toEqual([b2, b3, b4]);
      expect(qtd(n!, 5, 1).slice(2, 4)).toEqual([c3, c4]);
      expect(qtd(n!, 4, 1)[3]).toBe(d4);
      expect(qtd(n!, 0, r.mesSorte!)[4]).toBe(mes); // Mês de Sorte: 1 por aposta simples, independente e cumulativo
    }
  });
  it('Loteca: prêmios acertando 14 e 13 pontos por triplos e duplos', () => {
    const r = R.loteca!;
    const certos = r.partidas!.map((p) => p.coluna!) as ColunaLoteca[];
    const errada = (c: ColunaLoteca): ColunaLoteca => (c === '1' ? '2' : '1');
    const outra = (c: ColunaLoteca): ColunaLoteca => (c === 'X' ? '1' : 'X');
    /** triplos T e duplos D com acerto; erro opcional num duplo ou num jogo seco. */
    const jogo = (t: number, d: number, erro: 'nenhum' | 'duplo' | 'seco') =>
      certos.map((c, i): ColunaLoteca[] => {
        if (i < t) return ['1', 'X', '2'];
        if (i < t + d) return [c, outra(c)];
        if (erro === 'duplo' && i === t + d) return (['1', 'X', '2'] as ColunaLoteca[]).filter((x) => x !== c); // duplo com as 2 colunas erradas
        if (erro === 'seco' && i === 13) return [errada(c)];
        return [c];
      });
    const premios = (p: ColunaLoteca[][]) => {
      const a = premioDaAposta({ numeros: [], palpites: p }, r)!;
      return [a.faixas.find((f) => f.faixa === 1)?.quantidade ?? 0, a.faixas.find((f) => f.faixa === 2)?.quantidade ?? 0];
    };
    // acertando 14: [triplos, duplos] -> [14 pontos, 13 pontos] (tabela oficial)
    const t14: number[][] = [[0, 1, 1, 1], [0, 2, 1, 2], [0, 3, 1, 3], [0, 4, 1, 4], [1, 0, 1, 2], [1, 1, 1, 3], [2, 0, 1, 4], [2, 1, 1, 5],
      [2, 2, 1, 6], [3, 0, 1, 6], [3, 1, 1, 7], [3, 3, 1, 9], [4, 0, 1, 8], [4, 1, 1, 9]];
    for (const [t, d, q14, q13] of t14) expect(premios(jogo(t!, d!, 'nenhum'))).toEqual([q14, q13]);
    // acertando 13 com o erro num duplo (duas colunas erradas): 2 prêmios de 13; erro num jogo seco: 1
    const t13: number[][] = [[0, 0, 2], [0, 1, 2], [0, 2, 2], [0, 3, 2], [1, 1, 2], [1, 2, 2], [1, 3, 2], [2, 1, 2], [3, 0, 2], [3, 1, 2], [3, 2, 2]];
    for (const [t, d, q13] of t13) {
      const p = jogo(t!, d!, 'duplo');
      expect(p[t! + d!]).toHaveLength(2);
      expect(premios(p)).toEqual([0, q13]);
    }
    expect(premios(jogo(2, 0, 'seco'))).toEqual([0, 1]);
  });
});

describe('uma aposta em cada faixa, com o rateio real', () => {
  const fora = (m: ModalidadeSlug, ...listas: number[][]) => {
    const regra = REGRAS_CONFERENCIA[m] as Extract<(typeof REGRAS_CONFERENCIA)[ModalidadeSlug], { tipo: 'numeros' }>;
    const todas = new Set(listas.flat());
    return Array.from({ length: regra.ate - regra.de + 1 }, (_, i) => i + regra.de).filter((x) => !todas.has(x));
  };
  const umaFaixa = (m: ModalidadeSlug, faixa: number, jogo: Parameters<typeof premioDaAposta>[0]) => {
    const p = premioDaAposta(jogo, R[m]!)!;
    expect(p.faixas.map((f) => f.faixa), `${m} faixa ${faixa}`).toEqual([faixa]);
    expect(p.total).toBe(R[m]!.rateios.find((x) => x.faixa === faixa)!.valorPremio);
  };

  it('Mega, Quina e Lotofácil: cada faixa por acertos', () => {
    for (const m of ['mega-sena', 'quina', 'lotofacil'] as const) {
      const r = R[m]!;
      const k = (REGRAS_CONFERENCIA[m] as { k: number }).k;
      for (const x of r.rateios) umaFaixa(m, x.faixa, [...r.dezenas.slice(0, x.acertos!), ...fora(m, r.dezenas).slice(0, k - x.acertos!)]);
      // abaixo da última faixa não premia
      const min = Math.min(...r.rateios.map((x) => x.acertos!));
      expect(premioDaAposta([...r.dezenas.slice(0, min - 1), ...fora(m, r.dezenas).slice(0, k - min + 1)], r)!.faixas).toEqual([]);
    }
  });
  it('Dupla Sena: as 4 faixas de cada sorteio', () => {
    const r = R['dupla-sena']!;
    const so1 = r.dezenas.filter((x) => !r.dezenas2!.includes(x));
    const so2 = r.dezenas2!.filter((x) => !r.dezenas.includes(x));
    const nenhum = fora('dupla-sena', r.dezenas, r.dezenas2!);
    // o 1º sorteio só tem 4 dezenas exclusivas: a sena/quina do 1º usam as comuns (22, 28), que valem no 2º também
    for (const [faixa, j] of [[3, 4], [4, 3]] as const) umaFaixa('dupla-sena', faixa, [...so1.slice(0, j), ...nenhum.slice(0, 6 - j)]);
    for (const [faixa, j] of [[7, 4], [8, 3]] as const) umaFaixa('dupla-sena', faixa, [...so2.slice(0, j), ...nenhum.slice(0, 6 - j)]);
    const sena1 = premioDaAposta(r.dezenas, r)!; // 6 no 1º e 2 (22, 28) no 2º
    expect(sena1.faixas.map((f) => [f.sorteio, f.faixa])).toEqual([[1, 1]]);
    const sena2 = premioDaAposta(r.dezenas2!, r)!;
    expect(sena2.faixas.map((f) => [f.sorteio, f.faixa])).toEqual([[2, 5]]);
    const quina2 = premioDaAposta([...r.dezenas2!.slice(0, 5), nenhum[0]!], r)!;
    expect(quina2.faixas.map((f) => [f.sorteio, f.faixa])).toEqual([[2, 6]]);
  });
  it('Lotomania: 20, 19, 18, 17, 16, 15 e 0 acertos; aposta-espelho', () => {
    const r = R.lotomania!;
    const nao = fora('lotomania', r.dezenas);
    for (const x of r.rateios) umaFaixa('lotomania', x.faixa, [...r.dezenas.slice(0, x.acertos!), ...nao.slice(0, 50 - x.acertos!)]);
    expect(premioDaAposta([...r.dezenas.slice(0, 14), ...nao.slice(0, 36)], r)!.faixas).toEqual([]);
    // espelho: os outros 50 números. Quem tem 0 acertos no jogo tem 20 no espelho
    const jogo = nao.slice(0, 50);
    const espelho = Array.from({ length: 100 }, (_, i) => i).filter((x) => !jogo.includes(x));
    expect(premioDaAposta(jogo, r)!.faixas.map((f) => f.acertos)).toEqual([0]);
    expect(premioDaAposta(espelho, r)!.faixas.map((f) => f.acertos)).toEqual([20]);
  });
  it('Timemania: 7 a 3 números (com time errado) e só o Time do Coração', () => {
    const r = R.timemania!;
    const nao = fora('timemania', r.dezenas);
    for (const x of r.rateios.filter((y) => y.acertos !== null)) umaFaixa('timemania', x.faixa, { numeros: [...r.dezenas.slice(0, x.acertos!), ...nao.slice(0, 10 - x.acertos!)], timeCoracao: 'FLAMENGO/RJ' });
    umaFaixa('timemania', 6, { numeros: nao.slice(0, 10), timeCoracao: 'Cuiabá - MT' });
    // valores fixos oficiais: 3 números R$ 3,50; 4 números R$ 10,50; Time do Coração R$ 8,50
    expect(r.rateios.filter((x) => [4, 5, 6].includes(x.faixa)).map((x) => x.valorPremio)).toEqual([10.5, 3.5, 8.5]);
    expect(conferirJogo([...r.dezenas, ...nao.slice(0, 4)], r)).toEqual({ motivo: 'jogo com números inválidos' }); // 11 números
  });
  it('Dia de Sorte: 7 a 4 acertos (mês errado) e só o Mês de Sorte', () => {
    const r = R['dia-de-sorte']!;
    const nao = fora('dia-de-sorte', r.dezenas);
    for (const x of r.rateios.filter((y) => y.acertos !== null)) umaFaixa('dia-de-sorte', x.faixa, { numeros: [...r.dezenas.slice(0, x.acertos!), ...nao.slice(0, 7 - x.acertos!)], mesSorte: 1 });
    umaFaixa('dia-de-sorte', 5, { numeros: nao.slice(0, 7), mesSorte: 6 });
    // valores fixos oficiais: 4 números R$ 5,00; 5 números R$ 25,00; Mês de Sorte R$ 2,50
    expect(r.rateios.filter((x) => [3, 4, 5].includes(x.faixa)).map((x) => x.valorPremio)).toEqual([25, 5, 2.5]);
  });
  it('+Milionária: as 10 faixas e as combinações que não premiam', () => {
    const r = R['mais-milionaria']!;
    const nao = fora('mais-milionaria', r.dezenas);
    const trevosCom = (i: number) => [...r.trevos!.slice(0, i), ...[1, 2, 3, 4, 5, 6].filter((x) => !r.trevos!.includes(x)).slice(0, 2 - i)];
    const jogo = (j: number, i: number) => ({ numeros: [...r.dezenas.slice(0, j), ...nao.slice(0, 6 - j)], trevos: trevosCom(i) });
    const casos: [number, number, number][] = [[1, 6, 2], [2, 6, 1], [2, 6, 0], [3, 5, 2], [4, 5, 1], [4, 5, 0], [5, 4, 2], [6, 4, 1], [6, 4, 0], [7, 3, 2], [8, 3, 1], [9, 2, 2], [10, 2, 1]];
    for (const [faixa, j, i] of casos) umaFaixa('mais-milionaria', faixa, jogo(j, i));
    for (const [j, i] of [[3, 0], [2, 0], [1, 2], [0, 2], [1, 1]]) expect(premioDaAposta(jogo(j!, i!), r)!.faixas, `${j}+${i}`).toEqual([]);
    // fixos oficiais: faixa 7 R$ 50; 8 R$ 24; 9 R$ 12; 10 R$ 6
    expect(r.rateios.filter((x) => x.faixa >= 7).map((x) => x.valorPremio)).toEqual([50, 24, 12, 6]);
  });
  it('Super Sete: 7 a 3 colunas; 2 colunas não premiam; regras do volante', () => {
    const r = R['super-sete']!;
    const colunas = (acertos: number) => r.dezenas.map((d, i) => [i < acertos ? d : (d + 1) % 10]);
    for (const x of r.rateios) umaFaixa('super-sete', x.faixa, { numeros: [], colunas: colunas(x.acertos!) });
    expect(premioDaAposta({ numeros: [], colunas: colunas(2) }, r)!.faixas).toEqual([]);
    expect(r.rateios.find((x) => x.acertos === 3)!.valorPremio).toBe(6); // fixo oficial
    // 7 = 1 por coluna; 8 a 14 = 1 ou 2; 15 a 21 = 2 ou 3
    expect(colunasSuperSeteValidas([1, 1, 1, 1, 1, 1, 1])).toBe(true);
    expect(colunasSuperSeteValidas([2, 2, 2, 2, 2, 2, 1])).toBe(true);
    expect(colunasSuperSeteValidas([3, 1, 1, 1, 1, 1, 1])).toBe(false); // 9 números: no máximo 2 por coluna
    expect(colunasSuperSeteValidas([3, 2, 2, 2, 2, 2, 2])).toBe(true);
    expect(colunasSuperSeteValidas([3, 3, 3, 3, 3, 1, 1])).toBe(false); // 17 números: no mínimo 2 por coluna
    expect(colunasPadraoSuperSete(15)).toEqual([3, 2, 2, 2, 2, 2, 2]);
    expect(conferirJogo({ numeros: [], colunas: [[1, 2, 3], [1], [1], [1], [1], [1], [1]] }, r)).toEqual({ motivo: 'jogo fora das regras do Super Sete' });
  });
  it('Loteca: 14 e 13 pontos; 12 não premia', () => {
    const r = R.loteca!;
    const certos = r.partidas!.map((p) => [p.coluna!]) as ColunaLoteca[][];
    const erros = (n: number) => certos.map((c, i) => (i < n ? ([c[0] === '1' ? '2' : '1'] as ColunaLoteca[]) : c));
    umaFaixa('loteca', 1, { numeros: [], palpites: erros(0) });
    umaFaixa('loteca', 2, { numeros: [], palpites: erros(1) });
    expect(premioDaAposta({ numeros: [], palpites: erros(2) }, r)!.faixas).toEqual([]);
  });
});
