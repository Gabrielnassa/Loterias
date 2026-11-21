import { combinacoes, MODALIDADES, type ModalidadeSlug } from '../dominio/modalidades';
import { breakEvenFracao, cotasParaEmpatar, resultadoBolao, tarifaPorCota } from '../regras/financeiro';
import { centavos } from '../util/estatistica';

/**
 * Simulador de bolões: custo, valor da cota, margem e cotas, com e sem franquia, conferindo os
 * LIMITES OFICIAIS do Bolão CAIXA publicados nas páginas de cada modalidade
 * (loterias.caixa.gov.br, 21/11/2026; equivalem ao Anexo I do Manual de Produtos):
 * valor mínimo do bolão, valor mínimo da cota, mínimo e máximo de cotas e de jogos.
 * Regra observada nas tabelas: a cota mínima de cada linha = max(cota mínima, valor de 1 jogo / cotas máximas).
 */
export interface LimitesBolao {
  bolaoMinimo: number;
  cotaMinima: number;
  cotasMinimo: number;
  /** Máximo de cotas por quantidade de números marcados (ou o padrão). */
  cotasMaximo: number | Record<number, number>;
  /** Máximo de jogos (apostas) por bolão; por quantidade de números quando varia. */
  jogosMaximo: number | Record<number, number>;
  /** Números permitidos num jogo de bolão. */
  numeros: [number, number];
  bolaoMaximo?: number;
  observacao?: string;
}

export const LIMITES_BOLAO: Partial<Record<ModalidadeSlug, LimitesBolao>> = {
  'mega-sena': { bolaoMinimo: 18, cotaMinima: 7, cotasMinimo: 2, cotasMaximo: 100, jogosMaximo: 10, numeros: [6, 20] },
  quina: { bolaoMinimo: 15, cotaMinima: 4, cotasMinimo: 2, cotasMaximo: 50, jogosMaximo: 10, numeros: [5, 15] },
  lotofacil: {
    bolaoMinimo: 14,
    cotaMinima: 4.5,
    cotasMinimo: 2,
    cotasMaximo: { 15: 7, 16: 35, 17: 40, 18: 50, 19: 85, 20: 100 },
    jogosMaximo: { 15: 10, 16: 10, 17: 10, 18: 10, 19: 10, 20: 4 },
    numeros: [15, 20],
  },
  'dupla-sena': { bolaoMinimo: 10, cotaMinima: 3, cotasMinimo: 2, cotasMaximo: { 6: 10, 7: 50, 8: 50, 9: 50, 10: 50, 11: 50, 12: 50, 13: 50, 14: 50, 15: 50 }, jogosMaximo: 10, numeros: [6, 15] },
  timemania: { bolaoMinimo: 7, cotaMinima: 3.5, cotasMinimo: 2, cotasMaximo: 15, jogosMaximo: 15, numeros: [10, 10] },
  'dia-de-sorte': { bolaoMinimo: 12, cotaMinima: 3, cotasMinimo: 2, cotasMaximo: { 7: 8, 8: 20, 9: 25, 10: 50, 11: 60, 12: 60, 13: 60, 14: 100, 15: 100 }, jogosMaximo: 10, numeros: [7, 15] },
  'super-sete': {
    bolaoMinimo: 12,
    cotaMinima: 3,
    cotasMinimo: 2,
    cotasMaximo: { 8: 10, 9: 20, 10: 40, 11: 50 },
    jogosMaximo: 10,
    numeros: [8, 21],
    observacao: 'A página também cita bolão mínimo de R$ 10 e cota de R$ 6; vale a tabela (R$ 12 e R$ 3).',
  },
  'mais-milionaria': { bolaoMinimo: 12, cotaMinima: 6, cotasMinimo: 2, cotasMaximo: 100, jogosMaximo: 14, numeros: [6, 12], bolaoMaximo: 83_160 },
  loteca: { bolaoMinimo: 16, cotaMinima: 4, cotasMinimo: 2, cotasMaximo: 50, jogosMaximo: 1, numeros: [14, 14], observacao: 'Bolão a partir de 3 duplos (8 apostas = R$ 16).' },
};

const porNumeros = (v: number | Record<number, number>, n: number, padrao: number) => (typeof v === 'number' ? v : (v[n] ?? padrao));

/** Apostas simples num jogo: C(n, k) (Super Sete: dígitos por coluna; +Milionária: x trevos; Loteca: 2^duplos x 3^triplos). */
export function apostasPorJogo(modalidade: ModalidadeSlug, o: { numeros?: number; trevos?: number; duplos?: number; triplos?: number }): number {
  if (modalidade === 'loteca') return 2 ** (o.duplos ?? 0) * 3 ** (o.triplos ?? 0);
  const n = o.numeros ?? MODALIDADES[modalidade].dezenasApostaSimples ?? 0;
  if (modalidade === 'super-sete') {
    if (n < 7 || n > 21) return 0;
    const cols = n <= 14 ? Array.from({ length: 7 }, (_, i) => (i < n - 7 ? 2 : 1)) : Array.from({ length: 7 }, (_, i) => (i < n - 14 ? 3 : 2));
    return cols.reduce<number>((s, x) => s * x, 1);
  }
  if (modalidade === 'lotomania') return n === 50 ? 1 : 0;
  if (modalidade === 'timemania') return n === 10 ? 1 : 0;
  const k = modalidade === 'mais-milionaria' ? 6 : MODALIDADES[modalidade].dezenasApostaSimples ?? 0;
  const base = combinacoes(n, k);
  return modalidade === 'mais-milionaria' ? base * combinacoes(o.trevos ?? 2, 2) : base;
}

export interface EntradaSimulador {
  modalidade: ModalidadeSlug;
  numeros?: number;
  trevos?: number;
  duplos?: number;
  triplos?: number;
  jogos: number;
  cotas: number;
  /** Franquia diária (R$). Sem ela, simula "sem franquia". */
  franquia?: number | null;
  /** Fração das cotas que espera vender (para o lucro esperado). Padrão: 1 (tudo). */
  vendaEsperada?: number;
}

export interface SimulacaoBolao {
  apostasPorJogo: number;
  valorJogo: number;
  valorBolao: number;
  /** Cota base (sem tarifa) e a última cota (resíduo de centavos). */
  valorCota: number;
  valorUltimaCota: number;
  tarifaPorCota: number;
  valorCotaComTarifa: number;
  /** Se vender tudo: tarifa + comissão (8,61%) = o que a lotérica ganha. */
  ganhoSeVenderTudo: number;
  margemSobreOBolao: number;
  /** Lucro com a venda esperada (sobra vira custo). */
  lucroEsperado: number;
  breakEven: { cotas: number; fracao: number };
  franquia: { limite: number; consome: number; cabem: number; sobra: number } | null;
  limites: LimitesBolao | null;
  /** Faixa de cotas válida para este valor de bolão (pelas regras oficiais). */
  cotasPermitidas: { min: number; max: number } | null;
  problemas: string[];
}

export function simularBolao(e: EntradaSimulador): SimulacaoBolao {
  const m = MODALIDADES[e.modalidade];
  const preco = m.precoApostaSimples ?? 0;
  const apostas = apostasPorJogo(e.modalidade, e);
  const valorJogo = centavos(apostas * preco);
  const valorBolao = centavos(valorJogo * e.jogos);
  const cotas = Math.max(1, Math.floor(e.cotas));
  const valorCota = Math.floor((valorBolao / cotas) * 100) / 100;
  const valorUltimaCota = centavos(valorBolao - valorCota * (cotas - 1));
  const tarifa = tarifaPorCota(valorCota);
  const lim = LIMITES_BOLAO[e.modalidade] ?? null;
  const problemas: string[] = [];
  const n = e.numeros ?? m.dezenasApostaSimples ?? 0;
  let cotasPermitidas: SimulacaoBolao['cotasPermitidas'] = null;
  if (!apostas) problemas.push('combinação de números inválida para a modalidade');
  if (lim) {
    const cotaMin = Math.max(lim.cotaMinima, centavos(valorJogo / porNumeros(lim.cotasMaximo, n, 100)));
    const cotasMax = Math.min(porNumeros(lim.cotasMaximo, n, 100), Math.floor(valorBolao / cotaMin + 1e-9));
    cotasPermitidas = cotasMax >= lim.cotasMinimo ? { min: lim.cotasMinimo, max: cotasMax } : null;
    if (e.modalidade !== 'loteca' && (n < lim.numeros[0] || n > lim.numeros[1])) problemas.push(`bolão de ${m.nome} aceita de ${lim.numeros[0]} a ${lim.numeros[1]} números`);
    const jMax = porNumeros(lim.jogosMaximo, n, 10);
    if (e.jogos > jMax) problemas.push(`no máximo ${jMax} jogos por bolão`);
    if (valorBolao < lim.bolaoMinimo) problemas.push(`bolão mínimo de R$ ${lim.bolaoMinimo.toFixed(2).replace('.', ',')}`);
    if (lim.bolaoMaximo && valorBolao > lim.bolaoMaximo) problemas.push(`bolão máximo de R$ ${lim.bolaoMaximo.toLocaleString('pt-BR')}`);
    if (cotas < lim.cotasMinimo) problemas.push(`no mínimo ${lim.cotasMinimo} cotas`);
    if (cotas > porNumeros(lim.cotasMaximo, n, 100)) problemas.push(`no máximo ${porNumeros(lim.cotasMaximo, n, 100)} cotas com ${n} números`);
    if (valorCota < cotaMin - 1e-9) problemas.push(`cota mínima de R$ ${cotaMin.toFixed(2).replace('.', ',')}`);
  } else {
    problemas.push('limites de bolão desta modalidade não publicados na página oficial: confira no Manual de Produtos');
  }
  const tudo = resultadoBolao({ cotasTotal: cotas, valorCotaBase: valorCota, cotasVendidasInternet: cotas });
  const vend = Math.round(Math.min(1, Math.max(0, e.vendaEsperada ?? 1)) * cotas);
  const esperado = resultadoBolao({ cotasTotal: cotas, valorCotaBase: valorCota, cotasVendidasInternet: vend });
  const fr = e.franquia ? { limite: e.franquia, consome: valorBolao, cabem: valorBolao ? Math.floor(e.franquia / valorBolao) : 0, sobra: centavos(e.franquia - (valorBolao ? Math.floor(e.franquia / valorBolao) : 0) * valorBolao) } : null;
  if (fr && valorBolao > fr.limite) problemas.push('o bolão sozinho passa da franquia do dia');
  return {
    apostasPorJogo: apostas,
    valorJogo,
    valorBolao,
    valorCota,
    valorUltimaCota,
    tarifaPorCota: tarifa,
    valorCotaComTarifa: centavos(valorCota + tarifa),
    ganhoSeVenderTudo: centavos(tudo.tarifa + tudo.comissao),
    margemSobreOBolao: valorBolao ? centavos(tudo.tarifa + tudo.comissao) / valorBolao : 0,
    lucroEsperado: esperado.lucro,
    breakEven: { cotas: cotasParaEmpatar(cotas, valorCota), fracao: breakEvenFracao() },
    franquia: fr,
    limites: lim,
    cotasPermitidas,
    problemas,
  };
}
