import type { ColunaLoteca } from '../dominio/jogo';

/**
 * Loteca: probabilidade de cada jogo e a melhor marcação para cada quantidade de duplos e triplos.
 *
 * Probabilidades: com odds publicadas (decimais), tira-se a margem da casa normalizando 1/odd
 * (1/o1 + 1/oX + 1/o2 passa de 1; divide cada uma pela soma). Sem odds, um modelo simples de
 * força (Elo): diferença de rating + vantagem do mando + forma recente; o empate é mais provável
 * entre times parecidos. É estimativa, não garantia.
 *
 * Melhor marcação: escolher em quais jogos pôr triplos e duplos para maximizar a chance dos 14
 * acertos (produto das chances de cada jogo), por programação dinâmica exata (14 jogos x triplos x duplos).
 */
export interface JogoLoteca {
  time1: string;
  time2: string;
  /** Odds decimais 1 / X / 2, se houver. */
  odds?: [number, number, number] | null;
  /** Ratings Elo (padrão 1500) e forma recente (pontos nos últimos 5 jogos, 0 a 15). */
  elo1?: number;
  elo2?: number;
  forma1?: number;
  forma2?: number;
  /** Jogo em campo neutro (sem mando). */
  neutro?: boolean;
}

export interface ProbabilidadesJogo {
  '1': number;
  X: number;
  '2': number;
  fonte: 'odds' | 'modelo';
  /** Margem da casa embutida nas odds (ex.: 0,06 = 6%). */
  margem?: number;
}

export const MANDO_ELO = 65;

export function probabilidadesLoteca(j: JogoLoteca): ProbabilidadesJogo {
  if (j.odds && j.odds.every((o) => o > 1)) {
    const inv = j.odds.map((o) => 1 / o);
    const soma = inv[0]! + inv[1]! + inv[2]!;
    return { '1': inv[0]! / soma, X: inv[1]! / soma, '2': inv[2]! / soma, fonte: 'odds', margem: Math.round((soma - 1) * 10_000) / 10_000 };
  }
  const dr = (j.elo1 ?? 1500) + (j.neutro ? 0 : MANDO_ELO) + 10 * ((j.forma1 ?? 7.5) - (j.forma2 ?? 7.5)) - (j.elo2 ?? 1500);
  const semEmpate = 1 / (1 + 10 ** (-dr / 400));
  const empate = 0.28 * Math.exp(-((dr / 400) ** 2));
  return { '1': (1 - empate) * semEmpate, X: empate, '2': (1 - empate) * (1 - semEmpate), fonte: 'modelo' };
}

export type TipoMarcacao = 'seco' | 'duplo' | 'triplo';

export interface MarcacaoJogo {
  colunas: ColunaLoteca[];
  tipo: TipoMarcacao;
  chance: number;
}

export interface Marcacao {
  duplos: number;
  triplos: number;
  apostas: number;
  /** Preço da aposta (aposta simples de R$ 2,00). */
  valor: number;
  jogos: MarcacaoJogo[];
  /** Chance de 14 acertos e de exatamente 13 (sem contar o bônus das apostas extras). */
  chance14: number;
  chance13: number;
}

/** Combinações de duplos e triplos aceitas no volante (tabela de preços oficial, 21/11/2026). */
export const COMBINACOES_LOTECA: [number, number][] = [
  ...Array.from({ length: 9 }, (_, d) => [d + 1, 0] as [number, number]),
  ...Array.from({ length: 9 }, (_, d) => [d, 1] as [number, number]),
  ...Array.from({ length: 7 }, (_, d) => [d, 2] as [number, number]),
  ...Array.from({ length: 6 }, (_, d) => [d, 3] as [number, number]),
  ...Array.from({ length: 4 }, (_, d) => [d, 4] as [number, number]),
  ...Array.from({ length: 2 }, (_, d) => [d, 5] as [number, number]),
  [0, 6],
];
export const PRECO_APOSTA_LOTECA = 2;

function ordenadas(p: ProbabilidadesJogo): [ColunaLoteca, number][] {
  return (['1', 'X', '2'] as const).map((c) => [c, p[c]] as [ColunaLoteca, number]).sort((a, b) => b[1] - a[1]);
}

/** Melhor marcação (máxima chance de 14) com exatamente `duplos` duplos e `triplos` triplos. */
export function melhorMarcacao(probs: readonly ProbabilidadesJogo[], duplos: number, triplos: number): Marcacao {
  const n = probs.length;
  const ord = probs.map(ordenadas);
  const logp = (i: number, t: TipoMarcacao) => {
    const o = ord[i]!;
    const p = t === 'triplo' ? 1 : t === 'duplo' ? o[0]![1] + o[1]![1] : o[0]![1];
    return Math.log(Math.max(p, 1e-12));
  };
  // dp[i][t][d] = melhor soma de log-probabilidades dos jogos i.. usando t triplos e d duplos
  const NEG = -Infinity;
  const dp: number[][][] = Array.from({ length: n + 1 }, () => Array.from({ length: triplos + 1 }, () => Array<number>(duplos + 1).fill(NEG)));
  dp[n]![0]![0] = 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let t = 0; t <= triplos; t++) {
      for (let d = 0; d <= duplos; d++) {
        let melhor = dp[i + 1]![t]![d]! + logp(i, 'seco');
        if (t > 0) melhor = Math.max(melhor, dp[i + 1]![t - 1]![d]! + logp(i, 'triplo'));
        if (d > 0) melhor = Math.max(melhor, dp[i + 1]![t]![d - 1]! + logp(i, 'duplo'));
        dp[i]![t]![d] = melhor;
      }
    }
  }
  const jogos: MarcacaoJogo[] = [];
  let t = triplos;
  let d = duplos;
  for (let i = 0; i < n; i++) {
    const o = ord[i]!;
    const alvo = dp[i]![t]![d]!;
    const eq = (x: number) => Math.abs(x - alvo) < 1e-9;
    if (t > 0 && eq(dp[i + 1]![t - 1]![d]! + logp(i, 'triplo'))) {
      jogos.push({ colunas: ['1', 'X', '2'], tipo: 'triplo', chance: 1 });
      t--;
    } else if (d > 0 && eq(dp[i + 1]![t]![d - 1]! + logp(i, 'duplo'))) {
      jogos.push({ colunas: [o[0]![0], o[1]![0]].sort() as ColunaLoteca[], tipo: 'duplo', chance: o[0]![1] + o[1]![1] });
      d--;
    } else {
      jogos.push({ colunas: [o[0]![0]], tipo: 'seco', chance: o[0]![1] });
    }
  }
  const chance14 = jogos.reduce((s, j) => s * j.chance, 1);
  const chance13 = jogos.reduce((s, j, i) => s + (1 - j.chance) * jogos.reduce((x, k, l) => (l === i ? x : x * k.chance), 1), 0);
  const apostas = 2 ** duplos * 3 ** triplos;
  return { duplos, triplos, apostas, valor: apostas * PRECO_APOSTA_LOTECA, jogos, chance14, chance13 };
}

/** A melhor marcação para cada combinação de duplos e triplos aceita no volante, mais barata primeiro. */
export function tabelaDeMarcacoes(probs: readonly ProbabilidadesJogo[]): Marcacao[] {
  return COMBINACOES_LOTECA.map(([d, t]) => melhorMarcacao(probs, d, t)).sort((a, b) => a.valor - b.valor || b.chance14 - a.chance14);
}
