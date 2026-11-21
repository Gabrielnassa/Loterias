import { combinacoes, type ModalidadeSlug } from '../dominio/modalidades';
import { REGRAS_CONFERENCIA, TIMES_TIMEMANIA } from './premios';

/**
 * Probabilidade de cada faixa para UM jogo, no mesmo critério das tabelas oficiais da CAIXA:
 * a chance de o jogo acertar exatamente j números (ex.: Mega com 7 números, quina = 1 em 44.981).
 * Conferido com as tabelas das páginas oficiais em 21/11/2026 (ver teste).
 *
 * Super Sete: cada coluna com m dígitos acerta com chance m/10. Loteca: cada jogo com m colunas
 * acerta com chance m/3 (ou a chance informada, ex.: a das odds); a CAIXA publica a Loteca como
 * número esperado de apostas simples premiadas (ver abaixo).
 */
export interface ProbabilidadeFaixa {
  descricao: string;
  acertos: number | null;
  probabilidade: number;
  /** "1 em X" (Infinity se impossível). */
  umEm: number;
}

export interface FormatoJogo {
  /** Números marcados (modalidades de números). */
  numeros?: number;
  /** Trevos marcados (+Milionária). */
  trevos?: number;
  /** Super Sete: dígitos por coluna (7 valores); sem isso, o padrão do volante para `numeros`. */
  porColuna?: number[];
  /** Loteca: colunas marcadas em cada jogo (14 valores de 1 a 3). */
  marcacoesLoteca?: number[];
  /** Loteca: chance de acertar cada jogo com as colunas marcadas (sem isso, m/3). */
  chancesLoteca?: number[];
}

/** P(o jogo com n números acertar exatamente j dos d sorteados de N). */
export function hipergeometrica(N: number, d: number, n: number, j: number): number {
  const total = combinacoes(N, d);
  return total ? (combinacoes(n, j) * combinacoes(N - n, d - j)) / total : 0;
}

function faixa(descricao: string, acertos: number | null, p: number): ProbabilidadeFaixa {
  return { descricao, acertos, probabilidade: p, umEm: p > 0 ? 1 / p : Infinity };
}

/** Distribuição da quantidade de acertos quando cada item i acerta com chance p[i] (independentes). */
export function distribuicaoBernoulli(p: number[]): number[] {
  let poli = [1];
  for (const pi of p) {
    const prox = new Array<number>(poli.length + 1).fill(0);
    poli.forEach((c, j) => {
      prox[j] = prox[j]! + c * (1 - pi);
      prox[j + 1] = prox[j + 1]! + c * pi;
    });
    poli = prox;
  }
  return poli;
}

/** Dígitos por coluna do volante do Super Sete para n números (o mais espalhado possível). */
export function colunasPadraoSuperSete(n: number): number[] {
  if (n < 7 || n > 21) throw new RangeError('Super Sete: de 7 a 21 números');
  if (n <= 14) return Array.from({ length: 7 }, (_, i) => (i < n - 7 ? 2 : 1));
  return Array.from({ length: 7 }, (_, i) => (i < n - 14 ? 3 : 2));
}

const FAIXAS_NUMEROS: Partial<Record<ModalidadeSlug, number[]>> = {
  'mega-sena': [6, 5, 4],
  quina: [5, 4, 3, 2],
  lotofacil: [15, 14, 13, 12, 11],
  'dupla-sena': [6, 5, 4, 3],
  lotomania: [20, 19, 18, 17, 16, 15, 0],
  timemania: [7, 6, 5, 4, 3],
  'dia-de-sorte': [7, 6, 5, 4],
};

/** Faixas da +Milionária: [acertos, trevos que valem]. */
export const FAIXAS_MAIS_MILIONARIA: [number, number[]][] = [
  [6, [2]], [6, [0, 1]], [5, [2]], [5, [0, 1]], [4, [2]], [4, [0, 1]], [3, [2]], [3, [1]], [2, [2]], [2, [1]],
];

export function probabilidadesDoJogo(modalidade: ModalidadeSlug, f: FormatoJogo): ProbabilidadeFaixa[] {
  const regra = REGRAS_CONFERENCIA[modalidade];
  if (regra.tipo === 'colunas') {
    const porColuna = f.porColuna ?? colunasPadraoSuperSete(f.numeros ?? 7);
    const dist = distribuicaoBernoulli(porColuna.map((m) => m / (regra.ate - regra.de + 1)));
    return [7, 6, 5, 4, 3].map((j) => faixa(`${j} acertos`, j, dist[j] ?? 0));
  }
  if (regra.tipo === 'loteca') {
    // Convenção da tabela oficial da Loteca: número ESPERADO de apostas simples premiadas na faixa
    // (apostas simples x chance de cada uma). Cada jogo com m colunas e chance P de acertar entra
    // como (P x + m − P); com 1 duplo, 13 pontos = 1 em 85.410, como publica a CAIXA.
    const marc = f.marcacoesLoteca ?? Array<number>(regra.jogos).fill(1);
    const p = f.chancesLoteca ?? marc.map((m) => m / 3);
    let poli = [1];
    marc.forEach((m, i) => {
      const pi = p[i]!;
      const prox = new Array<number>(poli.length + 1).fill(0);
      poli.forEach((c, j) => {
        prox[j] = prox[j]! + c * (m - pi);
        prox[j + 1] = prox[j + 1]! + c * pi;
      });
      poli = prox;
    });
    return [faixa('14 acertos', 14, poli[14] ?? 0), faixa('13 acertos', 13, poli[13] ?? 0)];
  }
  const n = f.numeros ?? regra.k;
  const N = regra.ate - regra.de + 1;
  const pNum = (j: number) => hipergeometrica(N, regra.sorteadas, n, j);
  if (regra.trevos) {
    const t = f.trevos ?? regra.trevos.k;
    const T = regra.trevos.ate - regra.trevos.de + 1;
    const pTrevo = (i: number) => hipergeometrica(T, regra.trevos!.sorteados, t, i);
    return FAIXAS_MAIS_MILIONARIA.map(([j, is]) => {
      const desc = is.length === 2 ? `${j} acertos + 1 ou nenhum trevo` : `${j} acertos + ${is[0]} trevo${is[0] === 1 ? '' : 's'}`;
      return faixa(desc, j, pNum(j) * is.reduce((s, i) => s + pTrevo(i), 0));
    });
  }
  const out = (FAIXAS_NUMEROS[modalidade] ?? []).map((j) => faixa(`${j} acertos`, j, pNum(j)));
  if (regra.especial === 'time-coracao') out.push(faixa('Time do Coração', null, 1 / TIMES_TIMEMANIA));
  if (regra.especial === 'mes-sorte') out.push(faixa('Mês da Sorte', null, 1 / 12));
  return out;
}

/** Chance de algum prêmio num jogo (faixas disjuntas por número de acertos; time/mês à parte). */
export function chanceDeAlgumPremio(modalidade: ModalidadeSlug, f: FormatoJogo): number {
  const fs = probabilidadesDoJogo(modalidade, f);
  const porAcertos = fs.filter((x) => x.acertos !== null).reduce((s, x) => s + x.probabilidade, 0);
  const extra = fs.find((x) => x.acertos === null)?.probabilidade ?? 0;
  const umSorteio = 1 - (1 - porAcertos) * (1 - extra);
  // Dupla Sena: dois sorteios independentes
  return modalidade === 'dupla-sena' ? 1 - (1 - umSorteio) ** 2 : umSorteio;
}


