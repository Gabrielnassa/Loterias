import { isodowDoDia, diaSP } from '../tempo/fuso';
import { centavos, mediana, percentil } from '../util/estatistica';
import { faixaDePreco, FAIXAS_PRECO, retratoMercado, serieMercado, type BolaoMercado } from './vitrine';

/**
 * Previsão de fechamento por "concursos parecidos" (Fase 4). Para o concurso em andamento, na
 * mesma fração da janela de vendas (ex.: 40% do tempo entre a abertura e o fechamento), procura os
 * concursos passados da mesma modalidade mais parecidos (bolões inseridos, R$ inserido, % já
 * vendido, dia da semana) e aplica a eles a razão "sobra no fechamento / à venda agora". A faixa
 * de confiança são os percentis 10 e 90 dessas razões (80%). O backtest refaz a previsão para os
 * últimos concursos usando só os anteriores a cada um (sem olhar o futuro) e conta quantas vezes a
 * sobra real caiu dentro da faixa.
 */
export interface ConcursoComBoloes {
  chave: string;
  abreEm: number;
  fechaEm: number;
  boloes: readonly BolaoMercado[];
}

export interface EstadoNaJanela {
  inseridos: number;
  valorInserido: number;
  boloesAVenda: number;
  cotasAVenda: number;
  valorAVenda: number;
  pctVendido: number;
}

export interface ResumoConcurso {
  chave: string;
  abreEm: number;
  fechaEm: number;
  diaSemana: number;
  fracao: number;
  estado: EstadoNaJanela;
  /** Só para concursos já fechados. */
  final: { boloesSobra: number; cotasSobra: number; valorSobra: number; pctVendido: number; porFaixa: Record<string, { cotas: number; sobra: number }> } | null;
  /** Fração da janela em que houve mais bolões à venda (pico). */
  picoFracao: number | null;
}

function estado(boloes: readonly BolaoMercado[], t: number, fecha: number): EstadoNaJanela {
  const r = retratoMercado(boloes, t, { fechaEm: fecha, maiores: 0 });
  const cotasInseridas = r.cotasVendidas + r.cotas;
  return { inseridos: r.inseridos, valorInserido: r.valorInserido, boloesAVenda: r.boloes, cotasAVenda: r.cotas, valorAVenda: r.valor, pctVendido: cotasInseridas ? r.cotasVendidas / cotasInseridas : 0 };
}

/** Resume um concurso na fração `fracao` da janela (0 = abertura, 1 = fechamento). */
export function resumirConcurso(c: ConcursoComBoloes, fracao: number, o: { agora?: number } = {}): ResumoConcurso {
  const dur = c.fechaEm - c.abreEm;
  const t = c.abreEm + dur * Math.min(1, Math.max(0, fracao));
  const fechado = o.agora === undefined || o.agora >= c.fechaEm;
  let final: ResumoConcurso['final'] = null;
  let picoFracao: number | null = null;
  if (fechado) {
    const antes = c.fechaEm - 1;
    const r = retratoMercado(c.boloes, antes, { fechaEm: c.fechaEm, maiores: 0 });
    const porFaixa: Record<string, { cotas: number; sobra: number }> = {};
    for (const b of c.boloes) {
      const f = faixaDePreco(b.valorCotaBase);
      const a = (porFaixa[f] ??= { cotas: 0, sobra: 0 });
      a.cotas += b.cotasTotal;
    }
    const vis = retratoMercado(c.boloes, antes, { fechaEm: c.fechaEm, maiores: Number.MAX_SAFE_INTEGER }).maiores;
    for (const v of vis) porFaixa[faixaDePreco(v.valorCotaBase)]!.sobra += v.disponiveis;
    final = { boloesSobra: r.boloes, cotasSobra: r.cotas, valorSobra: r.valor, pctVendido: r.cotasVendidas / Math.max(1, r.cotasVendidas + r.cotas), porFaixa };
    const passos = 48;
    const serie = serieMercado(c.boloes, { de: c.abreEm, ate: c.fechaEm, passoMs: Math.max(60_000, Math.ceil(dur / passos)), fechaEm: c.fechaEm });
    let max = -1;
    serie.forEach((p, i) => {
      if (p.boloes > max) [max, picoFracao] = [p.boloes, (i + 1) / serie.length];
    });
  }
  return { chave: c.chave, abreEm: c.abreEm, fechaEm: c.fechaEm, diaSemana: isodowDoDia(diaSP(new Date(c.abreEm))), fracao, estado: estado(c.boloes, t, c.fechaEm), final, picoFracao };
}

export interface Parecido {
  chave: string;
  abreEm: Date;
  distancia: number;
  /** Sobra final / à venda na mesma fração. */
  razaoCotas: number;
  cotasSobra: number;
  boloesSobra: number;
}

export interface Faixa {
  previsto: number;
  min: number;
  max: number;
}

export interface Previsao {
  fracao: number;
  /** Cotas e bolões que devem sobrar no fechamento (faixa de 80%). */
  cotasSobra: Faixa;
  boloesSobra: Faixa;
  valorSobra: Faixa;
  /** Instante previsto do pico de bolões à venda (pode já ter passado). */
  picoEm: Date | null;
  /** Para não sobrar nada: cotas (e bolões) que precisam ser vendidas por hora até o fechamento. */
  minimoParaZerar: { cotasPorHora: number; boloesPorHora: number; horasAteFechar: number } | null;
  /** Quanto cada faixa de preço sobrou nos parecidos, relativo à mais barata. */
  sobraPorFaixa: { faixa: string; pctSobra: number | null; relativa: number | null }[];
  parecidos: Parecido[];
}

function distancias(atual: EstadoNaJanela, diaAtual: number, cands: readonly ResumoConcurso[]) {
  const f = (e: EstadoNaJanela) => [Math.log1p(e.inseridos), Math.log1p(e.valorInserido), e.pctVendido];
  const xs = cands.map((c) => f(c.estado));
  const dp = [0, 1, 2].map((i) => {
    const v = xs.map((x) => x[i]!);
    const m = v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, v.length));
    return sd > 1e-9 ? sd : 1;
  });
  const a = f(atual);
  return cands.map((c, j) => {
    const d = Math.sqrt([0, 1, 2].reduce((s, i) => s + ((a[i]! - xs[j]![i]!) / dp[i]!) ** 2, 0));
    return { c, d: d + (c.diaSemana === diaAtual ? 0 : 0.5) };
  });
}

/**
 * Previsão para o concurso `atual` (resumido na fração em que ele está) a partir de `candidatos`
 * fechados da mesma modalidade, resumidos na MESMA fração. `k` parecidos (padrão 8).
 */
export function preverPorParecidos(atual: ResumoConcurso, candidatos: readonly ResumoConcurso[], o: { k?: number; agora?: number } = {}): Previsao | null {
  const cands = candidatos.filter((c) => c.final && c.estado.cotasAVenda > 0 && c.chave !== atual.chave);
  if (cands.length < 3) return null;
  const k = Math.min(o.k ?? 8, cands.length);
  const viz = distancias(atual.estado, atual.diaSemana, cands)
    .sort((a, b) => a.d - b.d)
    .slice(0, k);
  const rc = viz.map(({ c }) => c.final!.cotasSobra / c.estado.cotasAVenda);
  const rb = viz.map(({ c }) => c.final!.boloesSobra / Math.max(1, c.estado.boloesAVenda));
  const rv = viz.map(({ c }) => c.final!.valorSobra / Math.max(0.01, c.estado.valorAVenda));
  const faixa = (base: number, r: number[], inteiro: boolean): Faixa => {
    const arred = (x: number) => (inteiro ? Math.round(x) : centavos(x));
    return { previsto: arred(base * mediana(r)!), min: arred(base * percentil(r, 0.1)!), max: arred(base * percentil(r, 0.9)!) };
  };
  const dur = atual.fechaEm - atual.abreEm;
  const picos = viz.map(({ c }) => c.picoFracao).filter((x): x is number => x !== null);
  const agora = o.agora ?? atual.abreEm + dur * atual.fracao;
  const horas = (atual.fechaEm - agora) / 3_600_000;
  // sobra por faixa de preço (somando os parecidos)
  const soma: Record<string, { cotas: number; sobra: number }> = {};
  for (const { c } of viz) for (const [f, v] of Object.entries(c.final!.porFaixa)) {
    const a = (soma[f] ??= { cotas: 0, sobra: 0 });
    a.cotas += v.cotas;
    a.sobra += v.sobra;
  }
  const pct = FAIXAS_PRECO.map(([f]) => ({ faixa: f, pctSobra: soma[f]?.cotas ? soma[f]!.sobra / soma[f]!.cotas : null }));
  const base = pct.find((p) => p.pctSobra !== null && p.pctSobra > 0);
  return {
    fracao: atual.fracao,
    cotasSobra: faixa(atual.estado.cotasAVenda, rc, true),
    boloesSobra: faixa(atual.estado.boloesAVenda, rb, true),
    valorSobra: faixa(atual.estado.valorAVenda, rv, false),
    picoEm: picos.length ? new Date(atual.abreEm + dur * mediana(picos)!) : null,
    minimoParaZerar: horas > 0 ? { cotasPorHora: Math.ceil(atual.estado.cotasAVenda / horas), boloesPorHora: Math.ceil(atual.estado.boloesAVenda / horas), horasAteFechar: Math.round(horas * 10) / 10 } : null,
    sobraPorFaixa: pct.map((p) => ({ ...p, relativa: p.pctSobra === null || !base ? null : Math.round((p.pctSobra / base.pctSobra!) * 10) / 10 })),
    parecidos: viz.map(({ c, d }, i) => ({ chave: c.chave, abreEm: new Date(c.abreEm), distancia: Math.round(d * 100) / 100, razaoCotas: Math.round(rc[i]! * 1000) / 1000, cotasSobra: c.final!.cotasSobra, boloesSobra: c.final!.boloesSobra })),
  };
}

export interface ItemBacktest {
  chave: string;
  abreEm: Date;
  previsto: number;
  min: number;
  max: number;
  real: number;
  acertou: boolean;
  erroPct: number | null;
}

export interface Backtest {
  fracao: number;
  n: number;
  acertos: number;
  /** Erro absoluto mediano da previsão central, em % da sobra real. */
  erroMedianoPct: number | null;
  itens: ItemBacktest[];
}

/**
 * Backtest: para cada um dos `ultimos` concursos fechados (em ordem de abertura), prevê a sobra de
 * cotas com os concursos ANTERIORES a ele, na mesma fração, e compara com a sobra real.
 */
export function backtestPrevisao(resumos: readonly ResumoConcurso[], o: { ultimos?: number; k?: number; minimoHistorico?: number } = {}): Backtest {
  const fechados = resumos.filter((r) => r.final).sort((a, b) => a.abreEm - b.abreEm);
  const min = o.minimoHistorico ?? 5;
  const alvo = fechados.slice(Math.max(min, fechados.length - (o.ultimos ?? 16)));
  const itens: ItemBacktest[] = [];
  for (const r of alvo) {
    const anteriores = fechados.filter((x) => x.fechaEm <= r.abreEm);
    const p = preverPorParecidos(r, anteriores, o.k === undefined ? {} : { k: o.k });
    if (!p) continue;
    const real = r.final!.cotasSobra;
    itens.push({
      chave: r.chave,
      abreEm: new Date(r.abreEm),
      previsto: p.cotasSobra.previsto,
      min: p.cotasSobra.min,
      max: p.cotasSobra.max,
      real,
      acertou: real >= p.cotasSobra.min && real <= p.cotasSobra.max,
      erroPct: real > 0 ? Math.abs(p.cotasSobra.previsto - real) / real : null,
    });
  }
  const erros = itens.map((i) => i.erroPct).filter((x): x is number => x !== null);
  return { fracao: alvo[0]?.fracao ?? 0, n: itens.length, acertos: itens.filter((i) => i.acertou).length, erroMedianoPct: mediana(erros), itens };
}
