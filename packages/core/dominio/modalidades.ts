/**
 * Modalidades conhecidas.
 *
 * Preços da aposta simples e dias de sorteio conferidos nas páginas oficiais
 * (loterias.caixa.gov.br/Paginas/{Modalidade}.aspx) em 21/11/2026: sorteios a partir das 21h e, aos
 * domingos, a partir das 11h. A Lotofácil não informa os dias na página (mantido seg a sáb).
 * O horário de fechamento das cotas ainda é referência; a fonte da verdade é o que o Marketplace devolver.
 */

export const SLUGS_MODALIDADE = [
  'mega-sena',
  'lotofacil',
  'quina',
  'lotomania',
  'dupla-sena',
  'timemania',
  'dia-de-sorte',
  'super-sete',
  'mais-milionaria',
  'loteca',
] as const;

export type ModalidadeSlug = (typeof SLUGS_MODALIDADE)[number];

export interface Modalidade {
  slug: ModalidadeSlug;
  nome: string;
  cor: string;
  /** Quantas dezenas compõem a aposta simples (para modalidades combinatórias). */
  dezenasApostaSimples?: number;
  /** Preço de referência da aposta simples, em R$. Confirmar no Manual de Produtos. */
  precoApostaSimples?: number;
  /** Dias ISO (1 = segunda ... 7 = domingo) com sorteio. Referência; confirmar no calendário oficial. */
  diasSorteio: number[];
  /** Horário (São Paulo) em que a venda de cotas fecha no dia do sorteio. Referência; confirmar na Fase 0. */
  horarioFechamento: { hora: number; minuto: number };
}

export const MODALIDADES: Record<ModalidadeSlug, Modalidade> = {
  'mega-sena': {
    slug: 'mega-sena', nome: 'Mega-Sena', cor: '#209869',
    dezenasApostaSimples: 6, precoApostaSimples: 6, diasSorteio: [2, 4, 7],
    horarioFechamento: { hora: 20, minuto: 0 },
  },
  lotofacil: {
    slug: 'lotofacil', nome: 'Lotofácil', cor: '#930089',
    dezenasApostaSimples: 15, precoApostaSimples: 3.5, diasSorteio: [1, 2, 3, 4, 5, 6],
    horarioFechamento: { hora: 20, minuto: 0 },
  },
  quina: {
    slug: 'quina', nome: 'Quina', cor: '#260085',
    dezenasApostaSimples: 5, precoApostaSimples: 3, diasSorteio: [1, 2, 3, 4, 5, 7],
    horarioFechamento: { hora: 20, minuto: 0 },
  },
  lotomania: {
    slug: 'lotomania', nome: 'Lotomania', cor: '#f78100',
    precoApostaSimples: 3, diasSorteio: [1, 3, 5],
    horarioFechamento: { hora: 20, minuto: 0 },
  },
  'dupla-sena': {
    slug: 'dupla-sena', nome: 'Dupla Sena', cor: '#a61324',
    dezenasApostaSimples: 6, precoApostaSimples: 3, diasSorteio: [1, 3, 5],
    horarioFechamento: { hora: 20, minuto: 0 },
  },
  timemania: {
    slug: 'timemania', nome: 'Timemania', cor: '#00ff48',
    precoApostaSimples: 3.5, diasSorteio: [2, 4, 7],
    horarioFechamento: { hora: 20, minuto: 0 },
  },
  'dia-de-sorte': {
    slug: 'dia-de-sorte', nome: 'Dia de Sorte', cor: '#cb852b',
    dezenasApostaSimples: 7, precoApostaSimples: 2.5, diasSorteio: [1, 2, 3, 4, 5, 7],
    horarioFechamento: { hora: 20, minuto: 0 },
  },
  'super-sete': {
    slug: 'super-sete', nome: 'Super Sete', cor: '#a8cf45',
    precoApostaSimples: 3, diasSorteio: [1, 3, 5],
    horarioFechamento: { hora: 20, minuto: 0 },
  },
  'mais-milionaria': {
    slug: 'mais-milionaria', nome: '+Milionária', cor: '#2e3078',
    precoApostaSimples: 6, diasSorteio: [3, 5],
    horarioFechamento: { hora: 20, minuto: 0 },
  },
  loteca: {
    slug: 'loteca', nome: 'Loteca', cor: '#fb1f00',
    // concurso semanal: apostas até sábado 14h; a aposta mínima (R$ 4,00) já tem 1 duplo = 2 simples
    precoApostaSimples: 2, diasSorteio: [],
    horarioFechamento: { hora: 20, minuto: 0 },
  },
};

export function ehModalidade(valor: string): valor is ModalidadeSlug {
  return (SLUGS_MODALIDADE as readonly string[]).includes(valor);
}

/** Combinação C(n, k) exata para inteiros pequenos. */
export function combinacoes(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || n < 0 || k > n) return 0;
  const kk = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= kk; i++) r = (r * (n - kk + i)) / i;
  return Math.round(r);
}

/**
 * Custo de UM jogo com `dezenas` marcadas, para modalidades combinatórias
 * (Mega-Sena, Lotofácil, Quina, Dupla Sena, Dia de Sorte). Retorna undefined para as demais.
 * Usa o preço de referência; serve para simulação e validação de plausibilidade.
 */
export function custoJogo(slug: ModalidadeSlug, dezenas: number): number | undefined {
  const m = MODALIDADES[slug];
  if (!m.dezenasApostaSimples || !m.precoApostaSimples) return undefined;
  const n = combinacoes(dezenas, m.dezenasApostaSimples);
  if (n === 0) return undefined;
  return Math.round(n * m.precoApostaSimples * 100) / 100;
}
