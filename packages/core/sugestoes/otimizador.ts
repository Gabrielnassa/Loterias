import { formatarCodigoBolao } from '../dominio/codigo-bolao';
import { custoJogo, type ModalidadeSlug } from '../dominio/modalidades';
import type { BolaoHistorico } from '../mercado/estatisticas';
import { faixaDePreco } from '../mercado/vitrine';
import { resultadoBolao } from '../regras/financeiro';
import { diaSP, isodowDoDia } from '../tempo/fuso';
import { centavos, media, percentil } from '../util/estatistica';

/**
 * Sugestões (Fase 4): otimizador de formato, valor da cota e número de cotas, e divisão da
 * franquia de amanhã entre as loterias. Tudo a partir do que aconteceu com bolões PARECIDOS na
 * mesma UF nas últimas semanas (amostras da fração vendida até o fechamento):
 *
 *   lucro esperado = tarifa x cotas que devem vender + comissão (se vender ao menos 1) − sobra esperada
 *
 * calculado sobre cada amostra (não sobre a média), para medir o risco: chance de prejuízo e o
 * lucro no pior décimo (P10). A franquia é o recurso escasso, então o critério é lucro por R$ de franquia.
 */
export interface OpcaoBolao {
  modalidade: ModalidadeSlug;
  jogos: number;
  dezenas: number;
  cotas: number;
  /** Valor base da cota (sem tarifa) = custo dos jogos / cotas. */
  valorCota: number;
  /** Valor do bolão = o que consome da franquia. */
  valorBolao: number;
  formato: string;
}

export interface AvaliacaoOpcao extends OpcaoBolao {
  amostras: number;
  /** De onde vieram as amostras: mesmo formato, formatos parecidos (faixa de preço e cotas) ou o Brasil. */
  base: 'formato' | 'parecidos' | 'brasil';
  /** Fração média das cotas vendida até o fechamento. */
  chanceDeVenda: number;
  chanceDeEsgotar: number;
  tarifaEsperada: number;
  comissaoEsperada: number;
  sobraEsperada: number;
  lucroEsperado: number;
  /** Lucro esperado por R$ 1 de franquia. */
  lucroPorReal: number;
  /** Fração das amostras com prejuízo. */
  chanceDePrejuizo: number;
  lucroP10: number;
  lucroP90: number;
  risco: 'baixo' | 'medio' | 'alto';
}

/** Monta a opção (valor da cota = custo dos jogos / cotas, em centavos). */
export function opcaoBolao(modalidade: ModalidadeSlug, jogos: number, dezenas: number, cotas: number): OpcaoBolao | null {
  const custo = custoJogo(modalidade, dezenas);
  if (custo === undefined || cotas < 1) return null;
  const valorBolao = centavos(custo * jogos);
  return { modalidade, jogos, dezenas, cotas, valorCota: centavos(valorBolao / cotas), valorBolao, formato: formatarCodigoBolao({ jogos, dezenas, cotas }) };
}

/** Avalia a opção sobre as frações vendidas das amostras. */
export function avaliarOpcao(op: OpcaoBolao, fracoes: readonly number[], base: AvaliacaoOpcao['base']): AvaliacaoOpcao | null {
  if (!fracoes.length) return null;
  const lucros: number[] = [];
  let tarifa = 0;
  let comissao = 0;
  let sobra = 0;
  for (const f of fracoes) {
    const vendidas = Math.round(Math.min(1, Math.max(0, f)) * op.cotas);
    const r = resultadoBolao({ cotasTotal: op.cotas, valorCotaBase: op.valorCota, cotasVendidasInternet: vendidas });
    lucros.push(r.lucro);
    tarifa += r.tarifa;
    comissao += r.comissao;
    sobra += r.sobra;
  }
  const n = fracoes.length;
  const lucro = centavos(lucros.reduce((s, x) => s + x, 0) / n);
  const pPrej = lucros.filter((x) => x < 0).length / n;
  return {
    ...op,
    amostras: n,
    base,
    chanceDeVenda: media(fracoes)!,
    chanceDeEsgotar: fracoes.filter((f) => f >= 1).length / n,
    tarifaEsperada: centavos(tarifa / n),
    comissaoEsperada: centavos(comissao / n),
    sobraEsperada: centavos(sobra / n),
    lucroEsperado: lucro,
    lucroPorReal: Math.round((lucro / op.valorBolao) * 10_000) / 10_000,
    chanceDePrejuizo: pPrej,
    lucroP10: centavos(percentil(lucros, 0.1)!),
    lucroP90: centavos(percentil(lucros, 0.9)!),
    risco: pPrej <= 0.15 ? 'baixo' : pPrej <= 0.35 ? 'medio' : 'alto',
  };
}

const fracao = (b: BolaoHistorico) => (b.cotasTotal - b.disponiveis) / b.cotasTotal;

export interface FiltroAmostras {
  uf?: string;
  /** Primeiro dia (YYYY-MM-DD, SP) das amostras; padrão: todas. */
  desde?: string;
  /** Mínimo de amostras antes de alargar o critério (padrão 12). */
  minimo?: number;
}

/**
 * Frações vendidas de bolões ENCERRADOS parecidos com a opção: o mesmo formato na UF; se forem
 * poucos, a mesma faixa de preço da cota e cotas entre metade e o dobro na UF; se ainda forem
 * poucos, o mesmo critério no Brasil.
 */
export function amostrasParecidas(historico: readonly BolaoHistorico[], op: OpcaoBolao, f: FiltroAmostras = {}): { fracoes: number[]; base: AvaliacaoOpcao['base'] } {
  const minimo = f.minimo ?? 12;
  const fechados = historico.filter((b) => b.encerrado && b.modalidade === op.modalidade && (!f.desde || diaSP(b.entrouEm) >= f.desde));
  const naUf = f.uf ? fechados.filter((b) => b.loterica.uf === f.uf) : fechados;
  const mesmo = naUf.filter((b) => b.jogos === op.jogos && b.dezenas === op.dezenas && b.cotasTotal === op.cotas);
  if (mesmo.length >= minimo) return { fracoes: mesmo.map(fracao), base: 'formato' };
  const faixa = faixaDePreco(op.valorCota);
  const parecido = (b: BolaoHistorico) => faixaDePreco(b.valorCotaBase) === faixa && b.cotasTotal >= op.cotas / 2 && b.cotasTotal <= op.cotas * 2;
  const par = naUf.filter(parecido);
  if (par.length >= minimo) return { fracoes: par.map(fracao), base: 'parecidos' };
  return { fracoes: fechados.filter(parecido).map(fracao), base: 'brasil' };
}

/**
 * Otimizador: avalia os formatos usados na modalidade (na UF, ou no Brasil se a UF não tiver) com
 * cada número de cotas observado, e ordena por lucro por R$ de franquia (empate: menor risco).
 * `valorMaximo` limita o valor do bolão (ex.: o que sobra da franquia).
 */
export function otimizarFormato(historico: readonly BolaoHistorico[], o: { modalidade: ModalidadeSlug; uf?: string; desde?: string; valorMaximo?: number; limite?: number }): AvaliacaoOpcao[] {
  const daModalidade = historico.filter((b) => b.modalidade === o.modalidade && (!o.desde || diaSP(b.entrouEm) >= o.desde));
  const naUf = o.uf ? daModalidade.filter((b) => b.loterica.uf === o.uf) : daModalidade;
  const fonte = naUf.length ? naUf : daModalidade;
  const formatos = new Map<string, [number, number]>();
  const cotasVistas = new Map<string, Set<number>>();
  for (const b of fonte) {
    const k = `${b.jogos}x${b.dezenas}`;
    formatos.set(k, [b.jogos, b.dezenas]);
    (cotasVistas.get(k) ?? cotasVistas.set(k, new Set()).get(k)!).add(b.cotasTotal);
  }
  const avaliacoes: AvaliacaoOpcao[] = [];
  for (const [k, [jogos, dezenas]] of formatos) {
    for (const cotas of cotasVistas.get(k)!) {
      const op = opcaoBolao(o.modalidade, jogos, dezenas, cotas);
      if (!op || (o.valorMaximo !== undefined && op.valorBolao > o.valorMaximo)) continue;
      const { fracoes, base } = amostrasParecidas(historico, op, { ...(o.uf ? { uf: o.uf } : {}), ...(o.desde ? { desde: o.desde } : {}) });
      const a = avaliarOpcao(op, fracoes, base);
      if (a) avaliacoes.push(a);
    }
  }
  const ordemRisco = { baixo: 0, medio: 1, alto: 2 };
  return avaliacoes
    .sort((a, b) => b.lucroPorReal - a.lucroPorReal || ordemRisco[a.risco] - ordemRisco[b.risco] || b.amostras - a.amostras)
    .slice(0, o.limite ?? 10);
}

export interface LinhaFranquia {
  modalidade: ModalidadeSlug;
  /** R$ que a UF vendeu por dia (valor base), no mesmo dia da semana, nas últimas semanas. */
  procuraPorDia: number;
  /** R$ inserido por dia na UF (todas as lotéricas): a concorrência. */
  ofertaPorDia: number;
  boloesConcorrentesPorDia: number;
  /** Fração do inserido que vendeu (procura / oferta). */
  taxaDeVenda: number;
  /** Prêmio estimado do concurso (quando informado) e o peso dado a ele. */
  premioEstimado: number | null;
  recomendacao: AvaliacaoOpcao | null;
  valorSugerido: number;
  boloes: number;
  lucroEsperado: number;
  motivo: string;
}

export interface SugestaoFranquia {
  dia: string;
  uf: string;
  limite: number;
  usado: number;
  sobraDaFranquia: number;
  lucroEsperado: number;
  linhas: LinhaFranquia[];
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * Divide a franquia de `dia` entre as loterias que a UF compra naquele dia da semana: peso =
 * procura em R$ x lucro por R$ do melhor formato com lucro esperado positivo (prefere risco baixo
 * ou médio; o alto só quando é o único, e o motivo avisa), com
 * no máximo 25% da procura diária da UF por loteria (não adianta pôr mais do que o mercado
 * absorve). O resto da franquia fica livre.
 */
export function dividirFranquia(
  historico: readonly BolaoHistorico[],
  o: { dia: string; uf: string; limite: number; desde: string; premios?: Partial<Record<ModalidadeSlug, number>>; fatiaMaxima?: number },
): SugestaoFranquia {
  const dow = isodowDoDia(o.dia);
  const naUf = historico.filter((b) => b.loterica.uf === o.uf && diaSP(b.entrouEm) >= o.desde);
  const doDia = naUf.filter((b) => isodowDoDia(diaSP(b.entrouEm)) === dow);
  const dias = new Set(doDia.map((b) => diaSP(b.entrouEm))).size || 1;
  const modalidades = [...new Set(doDia.map((b) => b.modalidade))];
  const candidatas = new Map<ModalidadeSlug, AvaliacaoOpcao[]>();
  const linhas: LinhaFranquia[] = modalidades.map((m) => {
    const bs = doDia.filter((b) => b.modalidade === m);
    const fechados = bs.filter((b) => b.encerrado);
    const diasFechados = new Set(fechados.map((b) => diaSP(b.entrouEm))).size || 1;
    const procura = fechados.reduce((s, b) => s + (b.cotasTotal - b.disponiveis) * b.valorCotaBase, 0) / diasFechados;
    const oferta = fechados.reduce((s, b) => s + b.cotasTotal * b.valorCotaBase, 0) / diasFechados;
    // lucro esperado positivo; entre eles, prefere risco baixo ou médio (o alto só se for o único)
    const positivas = otimizarFormato(historico, { modalidade: m, uf: o.uf, desde: o.desde, valorMaximo: o.limite, limite: 50 }).filter((a) => a.lucroEsperado > 0);
    const opcoes = [...positivas.filter((a) => a.risco !== 'alto'), ...positivas.filter((a) => a.risco === 'alto')];
    candidatas.set(m, opcoes);
    const premio = o.premios?.[m] ?? null;
    return {
      modalidade: m,
      procuraPorDia: centavos(procura),
      ofertaPorDia: centavos(oferta),
      boloesConcorrentesPorDia: Math.round((bs.length / dias) * 10) / 10,
      taxaDeVenda: oferta ? procura / oferta : 0,
      premioEstimado: premio,
      recomendacao: opcoes[0] ?? null,
      valorSugerido: 0,
      boloes: 0,
      lucroEsperado: 0,
      motivo: '',
    };
  });
  // peso: procura x lucro por R$ (o prêmio alto aumenta a procura: +10% por ordem de grandeza acima de R$ 10 mi)
  const peso = (l: LinhaFranquia) => {
    if (!l.recomendacao) return 0;
    const bonus = l.premioEstimado && l.premioEstimado > 1e7 ? 1 + 0.1 * Math.log10(l.premioEstimado / 1e7) : 1;
    return l.procuraPorDia * bonus * Math.max(0, l.recomendacao.lucroPorReal);
  };
  const total = linhas.reduce((s, l) => s + peso(l), 0);
  const fatia = o.fatiaMaxima ?? 0.25;
  let usado = 0;
  for (const l of linhas.sort((a, b) => peso(b) - peso(a))) {
    const r = l.recomendacao;
    if (!r || !total) {
      l.motivo = r ? 'sem procura registrada na UF neste dia' : 'nenhum formato com lucro esperado positivo na UF';
      continue;
    }
    const alvo = Math.min((o.limite * peso(l)) / total, l.procuraPorDia * fatia, o.limite - usado);
    // dentro do valor alocado, o formato que dá o maior lucro TOTAL (prefere risco baixo/médio)
    const cands = candidatas.get(l.modalidade) ?? [];
    const total_ = (a: AvaliacaoOpcao) => Math.floor(alvo / a.valorBolao) * a.lucroEsperado;
    const semAlto = cands.filter((a) => a.risco !== 'alto' && total_(a) > 0);
    const melhor = (semAlto.length ? semAlto : cands.filter((a) => total_(a) > 0)).sort((a, b) => total_(b) - total_(a))[0];
    if (melhor) l.recomendacao = melhor;
    const rr = l.recomendacao!;
    l.boloes = Math.max(0, Math.floor(alvo / rr.valorBolao));
    l.valorSugerido = centavos(l.boloes * rr.valorBolao);
    l.lucroEsperado = centavos(l.boloes * rr.lucroEsperado);
    usado += l.valorSugerido;
    const r2 = rr;
    l.motivo =
      `a UF vendeu ~${fmt(l.procuraPorDia)}/dia (${Math.round(l.taxaDeVenda * 100)}% do inserido) com ${l.boloesConcorrentesPorDia.toLocaleString('pt-BR')} bolões/dia; ` +
      `${r2.formato} vendeu em média ${Math.round(r2.chanceDeVenda * 100)}% (${r2.amostras} bolões ${r2.base === 'formato' ? 'iguais' : r2.base === 'parecidos' ? 'parecidos' : 'parecidos no Brasil'})` +
      (r2.risco === 'alto' ? `; atenção: risco alto, ${Math.round(r2.chanceDePrejuizo * 100)}% dos parecidos deram prejuízo` : '');
  }
  // a franquia que sobrou vai para a loteria de maior lucro por R$ que ainda tem procura
  for (const l of linhas) {
    const r = l.recomendacao;
    if (!r || !l.boloes) continue;
    const espaco = l.procuraPorDia * fatia - l.valorSugerido;
    const extra = Math.floor(Math.min(espaco, o.limite - usado) / r.valorBolao);
    if (extra > 0) {
      l.boloes += extra;
      l.valorSugerido = centavos(l.boloes * r.valorBolao);
      l.lucroEsperado = centavos(l.boloes * r.lucroEsperado);
      usado += extra * r.valorBolao;
    }
  }
  usado = centavos(linhas.reduce((s, l) => s + l.valorSugerido, 0));
  return {
    dia: o.dia,
    uf: o.uf,
    limite: o.limite,
    usado,
    sobraDaFranquia: centavos(o.limite - usado),
    lucroEsperado: centavos(linhas.reduce((s, l) => s + l.lucroEsperado, 0)),
    linhas: linhas.sort((a, b) => b.valorSugerido - a.valorSugerido),
  };
}
