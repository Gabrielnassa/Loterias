import type { ModalidadeSlug } from '../dominio/modalidades';
import type { LotericaRef } from '../dominio/tipos';
import { resultadoBolao, somarResultados, type ResultadoFinanceiro } from '../regras/financeiro';
import { franquiaUsada } from '../regras/franquia';
import { diaSP, isodowDoDia, partesSP } from '../tempo/fuso';
import { centavos, mediana } from '../util/estatistica';
import { formatoDe, naRegiao, valorTotal, type RetratoMercado } from './vitrine';

/**
 * Estatísticas (Fase 4): panorama nacional por loteria e a ficha de qualquer lotérica, a partir
 * dos bolões vistos na vitrine. Lucro de terceiros é ESTIMATIVA: considera tudo vendido pela
 * internet (o balcão de outra lotérica não aparece na vitrine) e só fecha o resultado dos concursos
 * encerrados (antes disso a sobra ainda não existe).
 */
export interface BolaoHistorico {
  id: string;
  loterica: LotericaRef;
  modalidade: ModalidadeSlug;
  concurso: number;
  jogos: number;
  dezenas: number;
  cotasTotal: number;
  valorCotaBase: number;
  entrouEm: Date;
  esgotouEm: Date | null;
  /** Cotas disponíveis agora (ou no fechamento, se encerrado). */
  disponiveis: number;
  encerrado: boolean;
}

export interface LinhaPanorama {
  modalidade: ModalidadeSlug | 'total';
  concurso: number | null;
  boloes: number;
  cotas: number;
  valorInserido: number;
  valorAVenda: number;
  lotericas: number;
  esgotados: number;
}

/** Panorama nacional (Estatísticas › Loterias): um retrato por concurso à venda + total. */
export function panoramaNacional(itens: readonly { modalidade: ModalidadeSlug; concurso: number; retrato: RetratoMercado; lotericasCodigos?: readonly string[] }[]): LinhaPanorama[] {
  const linhas: LinhaPanorama[] = itens.map(({ modalidade, concurso, retrato: r }) => ({
    modalidade,
    concurso,
    boloes: r.boloes,
    cotas: r.cotas,
    valorInserido: r.valorInserido,
    valorAVenda: r.valor,
    lotericas: r.lotericas,
    esgotados: r.esgotados,
  }));
  const todas = new Set(itens.flatMap((i) => i.lotericasCodigos ?? []));
  linhas.push({
    modalidade: 'total',
    concurso: null,
    boloes: linhas.reduce((s, l) => s + l.boloes, 0),
    cotas: linhas.reduce((s, l) => s + l.cotas, 0),
    valorInserido: centavos(linhas.reduce((s, l) => s + l.valorInserido, 0)),
    valorAVenda: centavos(linhas.reduce((s, l) => s + l.valorAVenda, 0)),
    // a mesma lotérica pode estar em várias loterias: sem a lista, soma (limite superior)
    lotericas: todas.size || linhas.reduce((s, l) => s + l.lotericas, 0),
    esgotados: linhas.reduce((s, l) => s + l.esgotados, 0),
  });
  return linhas;
}

function financeiro(b: BolaoHistorico): ResultadoFinanceiro {
  return resultadoBolao({ cotasTotal: b.cotasTotal, valorCotaBase: b.valorCotaBase, cotasVendidasInternet: b.cotasTotal - b.disponiveis });
}

export interface MetricasLoterica {
  boloesPorSemana: number;
  pctVendido: number | null;
  cotaMedia: number | null;
  /** Mediana do tempo até esgotar (min), entre os que esgotaram. */
  minutosParaEsgotar: number | null;
  lucroPorBolao: number | null;
}

function metricas(bs: readonly BolaoHistorico[], semanas: number): MetricasLoterica {
  const cotas = bs.reduce((s, b) => s + b.cotasTotal, 0);
  const vend = bs.reduce((s, b) => s + b.cotasTotal - b.disponiveis, 0);
  const esg = bs.filter((b) => b.esgotouEm).map((b) => (b.esgotouEm!.getTime() - b.entrouEm.getTime()) / 60_000);
  const enc = bs.filter((b) => b.encerrado);
  return {
    boloesPorSemana: Math.round((bs.length / Math.max(1, semanas)) * 10) / 10,
    pctVendido: cotas ? vend / cotas : null,
    cotaMedia: bs.length ? centavos(bs.reduce((s, b) => s + b.valorCotaBase, 0) / bs.length) : null,
    minutosParaEsgotar: mediana(esg),
    lucroPorBolao: enc.length ? centavos(somarResultados(enc.map(financeiro)).lucro / enc.length) : null,
  };
}

function medianaDasMetricas(porLoterica: MetricasLoterica[]): MetricasLoterica {
  const m = (f: (x: MetricasLoterica) => number | null) => {
    const v = mediana(porLoterica.map(f).filter((x): x is number => x !== null));
    return v === null ? null : Math.round(v * 100) / 100;
  };
  return {
    boloesPorSemana: m((x) => x.boloesPorSemana) ?? 0,
    pctVendido: m((x) => x.pctVendido),
    cotaMedia: m((x) => x.cotaMedia),
    minutosParaEsgotar: m((x) => x.minutosParaEsgotar),
    lucroPorBolao: m((x) => x.lucroPorBolao),
  };
}

export interface FichaLoterica {
  loterica: LotericaRef;
  de: string;
  ate: string;
  franquiaHoje: number;
  boloes: number;
  valorInserido: number;
  cotasVendidas: number;
  pctVendido: number | null;
  /** Resultado estimado dos concursos ENCERRADOS do período. */
  resultado: ResultadoFinanceiro;
  emAndamento: { boloes: number; valorAVenda: number };
  porLoteria: { modalidade: ModalidadeSlug; boloes: number; valorInserido: number; pctVendido: number | null; lucro: number }[];
  evolucaoMensal: { mes: string; boloes: number; valorInserido: number; lucro: number }[];
  perfil: { cotaMedia: number | null; cotasMedias: number | null; bolaoMedio: number | null; formatos: { formato: string; boloes: number; pctVendido: number }[] };
  velocidade: {
    pctEsgotados: number | null;
    minutosParaEsgotar: number | null;
    /** [dia ISO 1..7][hora 0..23] = bolões inseridos. */
    mapaDeCalor: number[][];
    diaQueMaisMonta: number | null;
    horaQueMaisMonta: number | null;
  };
  comparacao: { loterica: MetricasLoterica; cidade: MetricasLoterica; uf: MetricasLoterica; lotericasNaCidade: number; lotericasNaUf: number };
  maiores: { id: string; modalidade: ModalidadeSlug; concurso: number; formato: string; valorTotal: number; pctVendido: number; entrouEm: Date }[];
  aVendaAgora: { id: string; modalidade: ModalidadeSlug; concurso: number; formato: string; disponiveis: number; cotasTotal: number; valorCotaBase: number; entrouEm: Date }[];
}

/**
 * Ficha completa da lotérica no período [de, ate] (dias em SP). `todos` = bolões de todas as
 * lotéricas no período (para a comparação com a cidade e a UF).
 */
export function fichaLoterica(codigo: string, todos: readonly BolaoHistorico[], o: { agora: Date; de: string; ate: string }): FichaLoterica | null {
  const noPeriodo = todos.filter((b) => {
    const d = diaSP(b.entrouEm);
    return d >= o.de && d <= o.ate;
  });
  const meus = noPeriodo.filter((b) => b.loterica.codigoCaixa === codigo);
  const ref = meus[0]?.loterica ?? todos.find((b) => b.loterica.codigoCaixa === codigo)?.loterica;
  if (!ref) return null;
  const semanas = Math.max(1, (Date.parse(`${o.ate}T12:00:00Z`) - Date.parse(`${o.de}T12:00:00Z`)) / (7 * 86_400_000) + 1 / 7);
  const enc = meus.filter((b) => b.encerrado);
  const cotas = meus.reduce((s, b) => s + b.cotasTotal, 0);
  const vend = meus.reduce((s, b) => s + b.cotasTotal - b.disponiveis, 0);

  const porMod = new Map<ModalidadeSlug, BolaoHistorico[]>();
  for (const b of meus) porMod.set(b.modalidade, [...(porMod.get(b.modalidade) ?? []), b]);
  const porMes = new Map<string, BolaoHistorico[]>();
  for (const b of meus) {
    const mes = diaSP(b.entrouEm).slice(0, 7);
    porMes.set(mes, [...(porMes.get(mes) ?? []), b]);
  }
  const lucroDe = (bs: BolaoHistorico[]) => somarResultados(bs.filter((b) => b.encerrado).map(financeiro)).lucro;
  const pct = (bs: BolaoHistorico[]) => {
    const c = bs.reduce((s, b) => s + b.cotasTotal, 0);
    return c ? bs.reduce((s, b) => s + b.cotasTotal - b.disponiveis, 0) / c : null;
  };

  const formatos = new Map<string, BolaoHistorico[]>();
  for (const b of meus) formatos.set(formatoDe(b), [...(formatos.get(formatoDe(b)) ?? []), b]);
  const calor = Array.from({ length: 8 }, () => Array<number>(24).fill(0));
  for (const b of meus) calor[isodowDoDia(diaSP(b.entrouEm))]![partesSP(b.entrouEm).hora]!++;
  let pico: [number, number, number] | null = null;
  const porDia = Array<number>(8).fill(0);
  const porHora = Array<number>(24).fill(0);
  for (let d = 1; d <= 7; d++) for (let h = 0; h < 24; h++) {
    porDia[d]! += calor[d]![h]!;
    porHora[h]! += calor[d]![h]!;
    if (calor[d]![h]! > 0 && (!pico || calor[d]![h]! > pico[2])) pico = [d, h, calor[d]![h]!];
  }

  const metricasPor = (filtro: { uf?: string; cidade?: string }) => {
    const grupos = new Map<string, BolaoHistorico[]>();
    for (const b of noPeriodo) if (naRegiao(b.loterica, filtro)) grupos.set(b.loterica.codigoCaixa, [...(grupos.get(b.loterica.codigoCaixa) ?? []), b]);
    return { med: medianaDasMetricas([...grupos.values()].map((bs) => metricas(bs, semanas))), n: grupos.size };
  };
  const cidade = metricasPor({ uf: ref.uf, cidade: ref.cidade });
  const uf = metricasPor({ uf: ref.uf });
  const esgotados = meus.filter((b) => b.esgotouEm);
  const argmax = (xs: number[], ini: number) => {
    let best = -1;
    let iBest: number | null = null;
    for (let i = ini; i < xs.length; i++) if (xs[i]! > best && xs[i]! > 0) [best, iBest] = [xs[i]!, i];
    return iBest;
  };
  return {
    loterica: ref,
    de: o.de,
    ate: o.ate,
    franquiaHoje: franquiaUsada(
      todos.filter((b) => b.loterica.codigoCaixa === codigo).map((b) => ({ inseridoEm: b.entrouEm, cotasTotal: b.cotasTotal, valorCotaBase: b.valorCotaBase })),
      diaSP(o.agora),
    ),
    boloes: meus.length,
    valorInserido: centavos(meus.reduce((s, b) => s + valorTotal(b), 0)),
    cotasVendidas: vend,
    pctVendido: cotas ? vend / cotas : null,
    resultado: somarResultados(enc.map(financeiro)),
    emAndamento: {
      boloes: meus.filter((b) => !b.encerrado && b.disponiveis > 0).length,
      valorAVenda: centavos(meus.filter((b) => !b.encerrado).reduce((s, b) => s + b.disponiveis * b.valorCotaBase, 0)),
    },
    porLoteria: [...porMod.entries()]
      .map(([modalidade, bs]) => ({ modalidade, boloes: bs.length, valorInserido: centavos(bs.reduce((s, b) => s + valorTotal(b), 0)), pctVendido: pct(bs), lucro: lucroDe(bs) }))
      .sort((a, b) => b.valorInserido - a.valorInserido),
    evolucaoMensal: [...porMes.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, bs]) => ({ mes, boloes: bs.length, valorInserido: centavos(bs.reduce((s, b) => s + valorTotal(b), 0)), lucro: lucroDe(bs) })),
    perfil: {
      cotaMedia: meus.length ? centavos(meus.reduce((s, b) => s + b.valorCotaBase, 0) / meus.length) : null,
      cotasMedias: meus.length ? Math.round((cotas / meus.length) * 10) / 10 : null,
      bolaoMedio: meus.length ? centavos(meus.reduce((s, b) => s + valorTotal(b), 0) / meus.length) : null,
      formatos: [...formatos.entries()]
        .map(([formato, bs]) => ({ formato, boloes: bs.length, pctVendido: pct(bs) ?? 0 }))
        .sort((a, b) => b.boloes - a.boloes || b.pctVendido - a.pctVendido)
        .slice(0, 8),
    },
    velocidade: {
      pctEsgotados: meus.length ? esgotados.length / meus.length : null,
      minutosParaEsgotar: mediana(esgotados.map((b) => (b.esgotouEm!.getTime() - b.entrouEm.getTime()) / 60_000)),
      mapaDeCalor: calor,
      diaQueMaisMonta: argmax(porDia, 1),
      horaQueMaisMonta: argmax(porHora, 0),
    },
    comparacao: { loterica: metricas(meus, semanas), cidade: cidade.med, uf: uf.med, lotericasNaCidade: cidade.n, lotericasNaUf: uf.n },
    maiores: [...meus]
      .sort((a, b) => valorTotal(b) - valorTotal(a))
      .slice(0, 10)
      .map((b) => ({ id: b.id, modalidade: b.modalidade, concurso: b.concurso, formato: formatoDe(b), valorTotal: valorTotal(b), pctVendido: (b.cotasTotal - b.disponiveis) / b.cotasTotal, entrouEm: b.entrouEm })),
    aVendaAgora: meus
      .filter((b) => !b.encerrado && b.disponiveis > 0)
      .sort((a, b) => b.entrouEm.getTime() - a.entrouEm.getTime())
      .map((b) => ({ id: b.id, modalidade: b.modalidade, concurso: b.concurso, formato: formatoDe(b), disponiveis: b.disponiveis, cotasTotal: b.cotasTotal, valorCotaBase: b.valorCotaBase, entrouEm: b.entrouEm })),
  };
}

export type CriterioTop = 'valor' | 'boloes' | 'vendido';

/** Top N lotéricas do período (Estatísticas › Lotéricas). */
export function topLotericas(todos: readonly BolaoHistorico[], o: { de: string; ate: string; criterio?: CriterioTop; limite?: number; filtro?: { uf?: string; cidade?: string } }) {
  const g = new Map<string, { loterica: LotericaRef; boloes: number; valor: number; vendido: number }>();
  for (const b of todos) {
    const d = diaSP(b.entrouEm);
    if (d < o.de || d > o.ate || !naRegiao(b.loterica, o.filtro)) continue;
    const a = g.get(b.loterica.codigoCaixa) ?? { loterica: b.loterica, boloes: 0, valor: 0, vendido: 0 };
    a.boloes++;
    a.valor += valorTotal(b);
    a.vendido += (b.cotasTotal - b.disponiveis) * b.valorCotaBase;
    g.set(b.loterica.codigoCaixa, a);
  }
  const chave = o.criterio ?? 'valor';
  return [...g.values()]
    .map((x) => ({ ...x, valor: centavos(x.valor), vendido: centavos(x.vendido) }))
    .sort((a, b) => b[chave] - a[chave] || a.loterica.nome.localeCompare(b.loterica.nome))
    .slice(0, o.limite ?? 10);
}
