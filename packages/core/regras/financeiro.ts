import { TAXA_COMISSAO, TAXA_TARIFA } from '../dominio/constantes';
import { centavos } from '../util/estatistica';

/**
 * Financeiro de um bolão (SPEC, Glossário e Motor de dados):
 *   tarifa   = 35% x valor base x cotas vendidas (internet E balcão; por cota, truncada em centavos)
 *   comissão = 8,61% x apostas (valor total do bolão) se vendeu ao menos 1 cota
 *   sobra    = cotas sobradas x valor da aposta por cota (valor base)
 *   lucro    = tarifa - sobra + comissão
 * Cotas de balcão (impressas no TFL) contam como vendidas (nunca viram sobra) e geram tarifa de 35%
 * (confirmado no oLoterico: impressos de R$ 29,15 geraram R$ 7,55 = 5 cotas de R$ 4,32 + R$ 1,51).
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
  /** Tarifa por cota informada pela fonte (valorTarifaServico); se ausente, calcula truncando. */
  tarifaPorCotaFonte?: number;
  /** Bolão com resíduo: a última cota tem valor diferente (vrUltimaCotaSemTarifa). */
  contemResiduo?: boolean;
  valorUltimaCotaBase?: number;
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
  /** Quanto foi pago no balcão (base + tarifa). */
  recebidoBalcao: number;
  tarifa: number;
  comissao: number;
  sobra: number;
  lucro: number;
}

/**
 * Tarifa por cota, TRUNCADA em centavos. Observado no portal (21/11/2026): cota de R$ 20,16 tem
 * tarifa R$ 7,05 (35% = 7,056). Um exemplo só: confirmar com o extrato da lotérica.
 */
export function tarifaPorCota(valorCotaBase: number, taxa = TAXA_TARIFA): number {
  return Math.floor(valorCotaBase * taxa * 100 + 1e-6) / 100;
}

/** Valor total das apostas do bolão (= soma das cotas sem tarifa), considerando o resíduo. */
export function valorDasApostas(b: { cotasTotal: number; valorCotaBase: number; contemResiduo?: boolean; valorUltimaCotaBase?: number }): number {
  if (b.contemResiduo && b.valorUltimaCotaBase !== undefined && b.cotasTotal > 1) {
    return centavos((b.cotasTotal - 1) * b.valorCotaBase + b.valorUltimaCotaBase);
  }
  return centavos(b.cotasTotal * b.valorCotaBase);
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
    return { apostas: 0, cotasVendidas: 0, cotasSobradas: 0, recebidoInternet: 0, recebidoBalcao: 0, tarifa: 0, comissao: 0, sobra: 0, lucro: 0 };
  }
  const apostas = valorDasApostas(b);
  const tarifaCota = b.tarifaPorCotaFonte ?? tarifaPorCota(b.valorCotaBase, taxas.tarifa);
  const tarifa = centavos(tarifaCota * vendidas);
  const comissao = vendidas >= 1 ? centavos(taxas.comissao * apostas) : 0;
  const cotasSobradas = b.cotasTotal - vendidas;
  const sobra = centavos(cotasSobradas * b.valorCotaBase);
  const recebidoInternet = centavos(b.cotasVendidasInternet * (b.valorCotaBase + tarifaCota));
  const recebidoBalcao = centavos(balcao * (b.valorCotaBase + tarifaCota));
  return {
    apostas,
    cotasVendidas: vendidas,
    cotasSobradas,
    recebidoInternet,
    recebidoBalcao,
    tarifa,
    comissao,
    sobra,
    lucro: centavos(tarifa - sobra + comissao),
  };
}

/**
 * Break-even de UM bolão: fração das cotas que precisa vender para o lucro chegar a zero.
 *   t·v − (N − v) + c·N = 0  =>  v/N = (1 − c) / (1 + t)  ≈ 67,70% com as taxas padrão.
 * (O "8,6%" que aparecia no glossário era a comissão de 8,61%, não o break-even.)
 */
export function breakEvenFracao(taxas: TaxasFinanceiras = TAXAS_PADRAO): number {
  return (1 - taxas.comissao) / (1 + taxas.tarifa);
}

/** Menor número de cotas vendidas (de um bolão vazio) com lucro >= 0. */
export function cotasParaEmpatar(cotasTotal: number, valorCotaBase: number, taxas: TaxasFinanceiras = TAXAS_PADRAO): number {
  for (let v = 0; v <= cotasTotal; v++) {
    const r = resultadoBolao({ cotasTotal, valorCotaBase, cotasVendidasInternet: v }, taxas);
    if (r.lucro >= 0) return v;
  }
  return cotasTotal;
}

export interface BreakEven {
  /** Lucro hoje (tarifa − sobra + comissão), contando o que ainda está à venda como sobra. */
  lucroAtual: number;
  /** Quantas cotas AINDA faltam vender para empatar (0 = já empatou; null = nem vendendo tudo). */
  cotasFaltando: number | null;
  /** % do total de cotas que precisa estar vendido para empatar ((vendidas + faltando) / total). */
  pctNecessario: number | null;
  cotasVendidas: number;
  cotasTotal: number;
}

/**
 * Break-even de um GRUPO de bolões (como o oLoterico mostra: "N cotas pro break-even").
 * Cada cota a mais vendida ganha (base + tarifa) — deixa de ser sobra e gera tarifa — e a 1ª cota
 * de um bolão sem vendas ainda libera a comissão do bolão inteiro. Guloso pelas cotas de maior ganho.
 * Caso real conferido: 2 bolões de Timemania de 8 cotas, um esgotado e outro 0/8 => 3 cotas.
 */
export function breakEvenGrupo(boloes: readonly BolaoFinanceiro[], taxas: TaxasFinanceiras = TAXAS_PADRAO): BreakEven {
  const ativos = boloes.filter((b) => !b.estornado);
  const resultados = ativos.map((b) => resultadoBolao(b, taxas));
  let lucro = resultados.reduce((s, r) => s + r.lucro, 0);
  const cotasTotal = ativos.reduce((s, b) => s + b.cotasTotal, 0);
  const cotasVendidas = resultados.reduce((s, r) => s + r.cotasVendidas, 0);
  const base = { lucroAtual: centavos(lucro), cotasVendidas, cotasTotal };
  if (lucro >= -1e-9) return { ...base, cotasFaltando: 0, pctNecessario: cotasTotal ? cotasVendidas / cotasTotal : null };

  const ganhos: number[] = [];
  ativos.forEach((b, i) => {
    const r = resultados[i]!;
    const restantes = b.cotasTotal - r.cotasVendidas;
    if (restantes <= 0) return;
    const porCota = b.valorCotaBase + (b.tarifaPorCotaFonte ?? tarifaPorCota(b.valorCotaBase, taxas.tarifa));
    const liberaComissao = r.cotasVendidas === 0 ? taxas.comissao * r.apostas : 0;
    ganhos.push(porCota + liberaComissao);
    for (let k = 1; k < restantes; k++) ganhos.push(porCota);
  });
  ganhos.sort((a, b) => b - a);
  for (let n = 0; n < ganhos.length; n++) {
    lucro += ganhos[n]!;
    if (lucro >= -1e-9) {
      const faltando = n + 1;
      return { ...base, cotasFaltando: faltando, pctNecessario: (cotasVendidas + faltando) / cotasTotal };
    }
  }
  return { ...base, cotasFaltando: null, pctNecessario: null };
}

/** Soma resultados de vários bolões (resumo do Financeiro MKP). */
export function somarResultados(rs: readonly ResultadoFinanceiro[]): ResultadoFinanceiro {
  const z: ResultadoFinanceiro = { apostas: 0, cotasVendidas: 0, cotasSobradas: 0, recebidoInternet: 0, recebidoBalcao: 0, tarifa: 0, comissao: 0, sobra: 0, lucro: 0 };
  for (const r of rs) {
    z.apostas += r.apostas;
    z.cotasVendidas += r.cotasVendidas;
    z.cotasSobradas += r.cotasSobradas;
    z.recebidoInternet += r.recebidoInternet;
    z.recebidoBalcao += r.recebidoBalcao;
    z.tarifa += r.tarifa;
    z.comissao += r.comissao;
    z.sobra += r.sobra;
    z.lucro += r.lucro;
  }
  for (const k of ['apostas', 'recebidoInternet', 'recebidoBalcao', 'tarifa', 'comissao', 'sobra', 'lucro'] as const) z[k] = centavos(z[k]);
  return z;
}
