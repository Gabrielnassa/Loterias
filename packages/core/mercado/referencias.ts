import type { ModalidadeSlug } from '../dominio/modalidades';

/**
 * Referência REAL: foto da vitrine do Marketplace na cidade de São Paulo em 21/11/2026, 16:44-16:53
 * (navegador logado, 150 páginas, 4.382 bolões únicos). Só agregados (sem lotéricas): ver
 * docs/observacoes/2026-11-21-vitrine-sp.md. O % vendido é PARCIAL (instante da foto, horas antes
 * do fechamento), útil para comparar faixas de preço entre si e calibrar a simulação.
 */
export const FONTE_REFERENCIA_SP = 'vitrine real, cidade de São Paulo, 21/11/2026 16:44';

/** Faixas de valor da cota COM tarifa usadas na foto. */
export const FAIXAS_COM_TARIFA: readonly [string, number, number][] = [
  ['até R$ 10', 0, 10],
  ['R$ 10-25', 10, 25],
  ['R$ 25-50', 25, 50],
  ['R$ 50-100', 50, 100],
  ['acima de R$ 100', 100, Infinity],
];

export function faixaComTarifa(valorCotaComTarifa: number): string {
  return (FAIXAS_COM_TARIFA.find(([, a, b]) => valorCotaComTarifa <= b + 1e-9 && (a === 0 || valorCotaComTarifa > a + 1e-9)) ?? FAIXAS_COM_TARIFA.at(-1)!)[0];
}

/** Preço da cota (com tarifa) x % vendido no instante da foto: [faixa, bolões, % vendido]. */
export const VENDIDO_POR_PRECO_SP: Partial<Record<ModalidadeSlug, [string, number, number][]>> = {
  'mega-sena': [
    ['até R$ 10', 33, 0.44],
    ['R$ 10-25', 333, 0.36],
    ['R$ 25-50', 108, 0.31],
    ['R$ 50-100', 60, 0.34],
    ['acima de R$ 100', 38, 0.39],
  ],
  quina: [
    ['R$ 10-25', 110, 0.35],
    ['acima de R$ 100', 164, 0.18],
  ],
};

/** Bolões por fila na cidade (1ª fila = lotéricas com ao menos 1 bolão; 2ª = com ao menos 2...). */
export const BOLOES_POR_FILA_SP: Partial<Record<ModalidadeSlug, number[]>> = {
  lotofacil: [202, 90, 57, 23],
  'mega-sena': [274, 129, 64, 42],
  quina: [427, 53],
  'mais-milionaria': [362, 140, 48],
};
export const MAIOR_FILA_VISTA_SP = 28;

/** Formatos (jogos x dezenas) mais comuns na foto. */
export const FORMATOS_MAIS_COMUNS_SP: Partial<Record<ModalidadeSlug, [number, number][]>> = {
  lotofacil: [[10, 15]],
  'mega-sena': [[10, 6], [10, 7]],
  'mais-milionaria': [[10, 6]],
};

/** Fator de venda relativo à média da modalidade, pela faixa de preço (com tarifa); 1 sem dado. */
export function fatorDeVendaPorPreco(modalidade: ModalidadeSlug, valorCotaComTarifa: number): number {
  const ref = VENDIDO_POR_PRECO_SP[modalidade] ?? VENDIDO_POR_PRECO_SP['mega-sena']!;
  const total = ref.reduce((s, [, n]) => s + n, 0);
  const media = ref.reduce((s, [, n, p]) => s + n * p, 0) / total;
  const linha = ref.find(([f]) => f === faixaComTarifa(valorCotaComTarifa));
  return linha ? linha[2] / media : 1;
}

/** % vendido observado na foto para a faixa de preço desta cota (para comparar com a estimativa). */
export function vendidoObservadoSP(modalidade: ModalidadeSlug, valorCotaComTarifa: number): { faixa: string; boloes: number; pctVendido: number; fonte: string } | null {
  const faixa = faixaComTarifa(valorCotaComTarifa);
  const linha = VENDIDO_POR_PRECO_SP[modalidade]?.find(([f]) => f === faixa);
  return linha ? { faixa, boloes: linha[1], pctVendido: linha[2], fonte: FONTE_REFERENCIA_SP } : null;
}
