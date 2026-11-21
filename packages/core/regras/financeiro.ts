import { TAXA_COMISSAO, TAXA_TARIFA } from '../dominio/constantes';
import { centavos } from '../util/estatistica';

/**
 * Financeiro de um bolão (SPEC, Glossário e Motor de dados):
 *   tarifa   = 35% x valor base x cotas vendidas pela internet
 *   comissão = 8,61% x apostas (valor total do bolão) se vendeu ao menos 1 cota
 *   sobra    = cotas sobradas x valor da aposta por cota (valor base)
 *   lucro    = tarifa - sobra + comissão
 * Cotas de balcão (TFL) contam como vendidas (não viram sobra) mas não geram tarifa de internet.
 * Bolão estornado (cancelado) não gera receita nem custo.
 * Prêmios NÃO entram no resultado.
 */

export interface TaxasFinanceiras {
  tarifa: number;
  comissao: number;
}
export const TAXAS_PADRAO: TaxasFinanceiras = { tarifa: TAXA_TARIFA, comissao: TAXA_COMISSAO };

export interface BolaoFinanceiro {
  cotasTotal: number;
  /** Valor base da cota (sem tarifa) = valor da aposta por cota. */
  valorCotaBase: number;
  cotasVendidasInternet: number;
  cotasVendidasBalcao?: number;
  estornado?: boolean;
}

export interface ResultadoFinanceiro {
  apostas: number;
  cotasVendidas: number;
  cotasSobradas: number;
  /** Quanto os clientes pagaram pela internet (base + tarifa). */
  recebidoInternet: number;
  tarifa: number;
  comissao: number;
  sobra: number;
  lucro: number;
}

function validar(b: BolaoFinanceiro) {
  const balcao = b.cotasVendidasBalcao ?? 0;
  if (b.cotasTotal <= 0) throw new RangeError('cotasTotal deve ser > 0');
  if (b.cotasVendidasInternet < 0 || balcao < 0) throw new RangeError('cotas vendidas negativas');
  if (b.cotasVendidasInternet + balcao > b.cotasTotal) {
    throw new RangeError('cotas vendidas maiores que o total');
  }
  if (b.valorCotaBase < 0) throw new RangeError('valor da cota negativo');
}

export function resultadoBolao(b: BolaoFinanceiro, taxas: TaxasFinanceiras = TAXAS_PADRAO): ResultadoFinanceiro {
  validar(b);
  const balcao = b.cotasVendidasBalcao ?? 0;
  const vendidas = b.cotasVendidasInternet + balcao;
  if (b.estornado) {
    return { apostas: 0, cotasVendidas: 0, cotasSobradas: 0, recebidoInternet: 0, tarifa: 0, comissao: 0, sobra: 0, lucro: 0 };
  }
  const apostas = centavos(b.cotasTotal * b.valorCotaBase);
  const tarifa = centavos(taxas.tarifa * b.valorCotaBase * b.cotasVendidasInternet);
  const comissao = vendidas >= 1 ? centavos(taxas.comissao * apostas) : 0;
  const cotasSobradas = b.cotasTotal - vendidas;
  const sobra = centavos(cotasSobradas * b.valorCotaBase);
  const recebidoInternet = centavos(b.cotasVendidasInternet * b.valorCotaBase * (1 + taxas.tarifa));
  return {
    apostas,
    cotasVendidas: vendidas,
    cotasSobradas,
    recebidoInternet,
    tarifa,
    comissao,
    sobra,
    lucro: centavos(tarifa - sobra + comissao),
  };
}

/**
 * Break-even: fração das cotas que precisa vender (pela internet) para o lucro chegar a zero.
 *   t·v − (N − v) + c·N = 0  =>  v/N = (1 − c) / (1 + t)
 * Com as taxas padrão: (1 − 0,0861) / 1,35 ≈ 67,70%.
 * (O exemplo "8,6%" do glossário da SPEC não fecha com a fórmula de lucro; ver CLAUDE.md.)
 */
export function breakEvenFracao(taxas: TaxasFinanceiras = TAXAS_PADRAO): number {
  return (1 - taxas.comissao) / (1 + taxas.tarifa);
}

/** Menor número de cotas vendidas pela internet com lucro >= 0. */
export function cotasParaEmpatar(cotasTotal: number, valorCotaBase: number, taxas: TaxasFinanceiras = TAXAS_PADRAO): number {
  for (let v = 0; v <= cotasTotal; v++) {
    const r = resultadoBolao({ cotasTotal, valorCotaBase, cotasVendidasInternet: v }, taxas);
    if (r.lucro >= 0) return v;
  }
  return cotasTotal;
}

/** Soma resultados de vários bolões (resumo do Financeiro MKP). */
export function somarResultados(rs: readonly ResultadoFinanceiro[]): ResultadoFinanceiro {
  const z: ResultadoFinanceiro = { apostas: 0, cotasVendidas: 0, cotasSobradas: 0, recebidoInternet: 0, tarifa: 0, comissao: 0, sobra: 0, lucro: 0 };
  for (const r of rs) {
    z.apostas += r.apostas;
    z.cotasVendidas += r.cotasVendidas;
    z.cotasSobradas += r.cotasSobradas;
    z.recebidoInternet += r.recebidoInternet;
    z.tarifa += r.tarifa;
    z.comissao += r.comissao;
    z.sobra += r.sobra;
    z.lucro += r.lucro;
  }
  for (const k of ['apostas', 'recebidoInternet', 'tarifa', 'comissao', 'sobra', 'lucro'] as const) z[k] = centavos(z[k]);
  return z;
}
