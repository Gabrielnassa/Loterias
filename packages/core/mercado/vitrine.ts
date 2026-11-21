import { BOLOES_POR_PAGINA } from '../dominio/constantes';
import { formatarCodigoBolao } from '../dominio/codigo-bolao';
import { semAcento } from '../dominio/jogo';
import type { ModalidadeSlug } from '../dominio/modalidades';
import type { LotericaRef } from '../dominio/tipos';
import { centavos } from '../util/estatistica';

/**
 * Mercado (Fase 4): estado da vitrine do Marketplace num instante e sua evolução, a partir da
 * história de cada bolão (entrada, mudanças de cotas disponíveis, saída). Mesma regra para a
 * simulação e para o banco (snapshots_bolao). Tudo é ESTIMATIVA a partir de leituras periódicas.
 */
export interface BolaoMercado {
  id: string;
  loterica: LotericaRef;
  modalidade: ModalidadeSlug;
  concurso: number;
  jogos: number;
  dezenas: number;
  cotasTotal: number;
  /** Valor base da cota (sem tarifa). */
  valorCotaBase: number;
  fila: number;
  /** Entrou na vitrine (first_seen_at), em ms. */
  entrouEm: number;
  /** Cotas disponíveis quando entrou. */
  disponiveisNaEntrada: number;
  /** Mudanças depois da entrada: [instante ms, cotas disponíveis], em ordem de tempo. */
  mudancas: readonly (readonly [number, number])[];
  /** Esgotou ou sumiu da vitrine (conta como vendido), em ms; null = seguiu à venda. */
  saiuEm: number | null;
}

export interface FiltroRegiao {
  uf?: string | null;
  cidade?: string | null;
}

const norm = (s: string) => semAcento(s).toLowerCase().trim();

export function naRegiao(l: LotericaRef, f: FiltroRegiao | undefined): boolean {
  if (!f) return true;
  if (f.uf && l.uf.toUpperCase() !== f.uf.toUpperCase()) return false;
  if (f.cidade && norm(l.cidade) !== norm(f.cidade)) return false;
  return true;
}

/** Cotas disponíveis em t (ms); null = ainda não tinha entrado. 0 depois que esgotou/sumiu. */
export function disponiveisEm(b: BolaoMercado, t: number): number | null {
  if (t < b.entrouEm) return null;
  if (b.saiuEm !== null && t >= b.saiuEm) return 0;
  let d = b.disponiveisNaEntrada;
  const m = b.mudancas;
  let lo = 0;
  let hi = m.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (m[mid]![0] <= t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0) d = m[lo - 1]![1];
  return d;
}

export const valorTotal = (b: Pick<BolaoMercado, 'cotasTotal' | 'valorCotaBase'>) => centavos(b.cotasTotal * b.valorCotaBase);
export const formatoDe = (b: Pick<BolaoMercado, 'jogos' | 'dezenas' | 'cotasTotal'>) => formatarCodigoBolao({ jogos: b.jogos, dezenas: b.dezenas, cotas: b.cotasTotal });

export interface BolaoNaVitrineAgora {
  id: string;
  loterica: LotericaRef;
  formato: string;
  fila: number;
  entrouEm: Date;
  cotasTotal: number;
  disponiveis: number;
  valorCotaBase: number;
  valorTotal: number;
  valorAVenda: number;
}

export interface RetratoMercado {
  em: Date;
  /** À venda em `em`. */
  boloes: number;
  cotas: number;
  lotericas: number;
  valor: number;
  paginas: number;
  filas: number;
  /** Valor base médio de uma cota à venda (R$). */
  ticketMedio: number | null;
  /** Valor médio de um bolão à venda (R$, cotas que restam). */
  valorMedioBolao: number | null;
  /** Desde a abertura do concurso até `em`. */
  inseridos: number;
  valorInserido: number;
  esgotados: number;
  pctEsgotado: number | null;
  cotasVendidas: number;
  valorVendido: number;
  /** Últimos 5 minutos. */
  delta5min: { cotasVendidas: number; valorVendido: number; novos: number; boloes: number };
  /** Cotas vendidas por minuto (média dos últimos 15 min). */
  ritmoPorMinuto: number;
  maiores: BolaoNaVitrineAgora[];
}

/**
 * Retrato da vitrine em `em` (ms ou Date). `fechaEm`: depois do fechamento nada está à venda.
 * "Maiores bolões" = maior valor total (cotas x valor da cota) entre os que estão à venda.
 */
export function retratoMercado(
  boloes: readonly BolaoMercado[],
  em: Date | number,
  o: { filtro?: FiltroRegiao; fechaEm?: Date | number | null; maiores?: number } = {},
): RetratoMercado {
  const t = typeof em === 'number' ? em : em.getTime();
  const fecha = o.fechaEm === undefined || o.fechaEm === null ? Infinity : typeof o.fechaEm === 'number' ? o.fechaEm : o.fechaEm.getTime();
  const aberto = t < fecha;
  const t5 = t - 5 * 60_000;
  const t15 = t - 15 * 60_000;
  let nBoloes = 0;
  let cotas = 0;
  let valor = 0;
  let inseridos = 0;
  let valorInserido = 0;
  let esgotados = 0;
  let vendidas = 0;
  let valorVendido = 0;
  let vend5 = 0;
  let valor5 = 0;
  let novos5 = 0;
  let boloes5 = 0;
  let vend15 = 0;
  let filas = 0;
  const lot = new Set<string>();
  const visiveis: BolaoNaVitrineAgora[] = [];
  const tVenda = Math.min(t, fecha);
  for (const b of boloes) {
    if (!naRegiao(b.loterica, o.filtro)) continue;
    const d = disponiveisEm(b, tVenda);
    if (d === null) continue;
    inseridos++;
    valorInserido += b.cotasTotal * b.valorCotaBase;
    const vb = b.cotasTotal - d;
    vendidas += vb;
    valorVendido += vb * b.valorCotaBase;
    if (d === 0) esgotados++;
    const d5 = disponiveisEm(b, Math.min(t5, fecha));
    const d15 = disponiveisEm(b, Math.min(t15, fecha));
    vend5 += (d5 ?? b.disponiveisNaEntrada) - d;
    valor5 += ((d5 ?? b.disponiveisNaEntrada) - d) * b.valorCotaBase;
    vend15 += (d15 ?? b.disponiveisNaEntrada) - d;
    if (d5 === null) novos5++;
    if (aberto && d5 !== null && d5 > 0 && t5 < fecha) boloes5++;
    if (aberto && d > 0) {
      nBoloes++;
      cotas += d;
      valor += d * b.valorCotaBase;
      lot.add(b.loterica.codigoCaixa);
      if (b.fila > filas) filas = b.fila;
      visiveis.push({
        id: b.id,
        loterica: b.loterica,
        formato: formatoDe(b),
        fila: b.fila,
        entrouEm: new Date(b.entrouEm),
        cotasTotal: b.cotasTotal,
        disponiveis: d,
        valorCotaBase: b.valorCotaBase,
        valorTotal: valorTotal(b),
        valorAVenda: centavos(d * b.valorCotaBase),
      });
    }
  }
  visiveis.sort((a, b) => b.valorTotal - a.valorTotal || a.entrouEm.getTime() - b.entrouEm.getTime());
  return {
    em: new Date(t),
    boloes: nBoloes,
    cotas,
    lotericas: lot.size,
    valor: centavos(valor),
    paginas: Math.ceil(nBoloes / BOLOES_POR_PAGINA),
    filas,
    ticketMedio: cotas ? centavos(valor / cotas) : null,
    valorMedioBolao: nBoloes ? centavos(valor / nBoloes) : null,
    inseridos,
    valorInserido: centavos(valorInserido),
    esgotados,
    pctEsgotado: inseridos ? esgotados / inseridos : null,
    cotasVendidas: vendidas,
    valorVendido: centavos(valorVendido),
    delta5min: { cotasVendidas: vend5, valorVendido: centavos(valor5), novos: novos5, boloes: nBoloes - boloes5 },
    ritmoPorMinuto: Math.round((vend15 / 15) * 10) / 10,
    maiores: visiveis.slice(0, o.maiores ?? 10),
  };
}

export interface PontoSerie {
  /** Fim do intervalo. */
  t: Date;
  boloes: number;
  cotas: number;
  valor: number;
  paginas: number;
  /** No intervalo. */
  novos: number;
  cotasVendidas: number;
  valorVendido: number;
  esgotados: number;
}

/**
 * Série da vitrine de `de` a `ate`, em passos de `passoMs` (1 min = minuto a minuto; 1 h = hora a
 * hora), por varredura dos eventos de cada bolão: O(eventos · log) em vez de O(passos · bolões).
 * Vendas = quedas de cotas disponíveis (devolução entra negativa); sumir = esgotar (vende o resto).
 */
export function serieMercado(
  boloes: readonly BolaoMercado[],
  o: { de: Date | number; ate: Date | number; passoMs: number; filtro?: FiltroRegiao; fechaEm?: Date | number | null },
): PontoSerie[] {
  const de = typeof o.de === 'number' ? o.de : o.de.getTime();
  const ateBruto = typeof o.ate === 'number' ? o.ate : o.ate.getTime();
  const fecha = o.fechaEm === undefined || o.fechaEm === null ? Infinity : typeof o.fechaEm === 'number' ? o.fechaEm : o.fechaEm.getTime();
  const ate = ateBruto;
  // eventos: [t, dBoloes, dCotas, dValor, novos, vendidas, valorVendido, esgotados]
  const ev: [number, number, number, number, number, number, number, number][] = [];
  for (const b of boloes) {
    if (!naRegiao(b.loterica, o.filtro)) continue;
    if (b.entrouEm >= fecha || b.entrouEm > ate) continue;
    const v = b.valorCotaBase;
    let atual = b.disponiveisNaEntrada;
    if (atual > 0) ev.push([b.entrouEm, 1, atual, atual * v, 1, 0, 0, 0]);
    else ev.push([b.entrouEm, 0, 0, 0, 1, 0, 0, 0]);
    for (const [tm, d] of b.mudancas) {
      if (tm >= fecha || tm > ate || (b.saiuEm !== null && tm >= b.saiuEm)) break;
      const delta = d - atual;
      if (delta === 0) continue;
      const db = atual > 0 && d === 0 ? -1 : atual === 0 && d > 0 ? 1 : 0;
      ev.push([tm, db, delta, delta * v, 0, -delta, -delta * v, d === 0 && atual > 0 ? 1 : 0]);
      atual = d;
    }
    if (b.saiuEm !== null && b.saiuEm < fecha && b.saiuEm <= ate && atual > 0) {
      ev.push([b.saiuEm, -1, -atual, -atual * v, 0, atual, atual * v, 1]);
      atual = 0;
    }
    // no fechamento, o que sobrou sai da vitrine sem ser vendido
    if (fecha <= ate && atual > 0) ev.push([fecha, -1, -atual, -atual * v, 0, 0, 0, 0]);
  }
  ev.sort((a, b) => a[0] - b[0]);
  let boloesAgora = 0;
  let cotas = 0;
  let valor = 0;
  let i = 0;
  // estado antes de `de`
  while (i < ev.length && ev[i]![0] < de) {
    boloesAgora += ev[i]![1];
    cotas += ev[i]![2];
    valor += ev[i]![3];
    i++;
  }
  const pontos: PontoSerie[] = [];
  for (let ini = de; ini < ate; ini += o.passoMs) {
    const fim = Math.min(ini + o.passoMs, ate);
    let novos = 0;
    let vend = 0;
    let valVend = 0;
    let esg = 0;
    while (i < ev.length && ev[i]![0] < fim) {
      const e = ev[i]!;
      boloesAgora += e[1];
      cotas += e[2];
      valor += e[3];
      novos += e[4];
      vend += e[5];
      valVend += e[6];
      esg += e[7];
      i++;
    }
    pontos.push({
      t: new Date(fim),
      boloes: boloesAgora,
      cotas,
      valor: centavos(valor),
      paginas: Math.ceil(boloesAgora / BOLOES_POR_PAGINA),
      novos,
      cotasVendidas: vend,
      valorVendido: centavos(valVend),
      esgotados: esg,
    });
  }
  return pontos;
}

/** Faixas de valor de cota (R$, valor base) usadas nas comparações de venda. */
export const FAIXAS_PRECO: readonly [string, number, number][] = [
  ['até R$ 10', 0, 10],
  ['R$ 10-20', 10, 20],
  ['R$ 20-50', 20, 50],
  ['R$ 50-100', 50, 100],
  ['acima de R$ 100', 100, Infinity],
];

/** Faixa da cota: (a, b], com a 1ª incluindo o zero ("até R$ 10" inclui os R$ 10,00). */
export function faixaDePreco(valorCota: number): string {
  return (FAIXAS_PRECO.find(([, a, b]) => valorCota <= b + 1e-9 && (a === 0 || valorCota > a + 1e-9)) ?? FAIXAS_PRECO.at(-1)!)[0];
}
