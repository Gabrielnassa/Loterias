import { MODALIDADES, type ModalidadeSlug } from '../dominio/modalidades';
import type { LotericaRef } from '../dominio/tipos';
import type { MetricaSemanal } from '../raio-x/semanal';
import { diaSP, horaSP, isodowDoDia, noDiaSP, semanaSP, somarDias } from '../tempo/fuso';

/**
 * Alertas (Fase 6): o que vira notificação na central e, conforme a preferência de CADA APARELHO,
 * push. Tudo aqui é puro: o worker consulta o banco, chama estas funções e despacha.
 */
export const CATEGORIAS = ['monitorada-abertura', 'resumo-semanal', 'venda', 'encerramento', 'resultado', 'previsao-zerar', 'premio', 'sistema'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const NOME_CATEGORIA: Record<Categoria, string> = {
  'monitorada-abertura': 'Monitorada entrou na abertura',
  'resumo-semanal': 'Resumo semanal das monitoradas',
  venda: 'Vendas',
  encerramento: 'Encerramento do concurso',
  resultado: 'Resultados',
  'previsao-zerar': 'Previsão de zerar',
  premio: 'Prêmios na lotérica',
  sistema: 'Avisos do sistema',
};

/** Tela que a pessoa precisa poder abrir para receber a categoria (null = qualquer pessoa da conta). */
export const TELA_DA_CATEGORIA: Record<Categoria, string | null> = {
  'monitorada-abertura': 'monitoradas',
  'resumo-semanal': 'monitoradas',
  venda: 'minha-boloes',
  encerramento: 'minha-boloes',
  'previsao-zerar': 'minha-boloes',
  premio: 'minha-conferencia',
  resultado: null,
  sistema: null,
};

/** Vendas: todas, só dos concursos que sorteiam hoje, só o resumo no encerramento, ou nada. */
export type ModoVendas = 'todas' | 'hoje' | 'encerramento' | 'nenhuma';
export const MODOS_VENDAS: readonly [ModoVendas, string][] = [
  ['hoje', 'Vendas de hoje (concursos que sorteiam hoje)'],
  ['todas', 'Todas as vendas'],
  ['encerramento', 'Só no encerramento (resumo do concurso)'],
  ['nenhuma', 'Nenhuma'],
];

export interface PreferenciasAparelho {
  vendas: ModoVendas;
  resultados: boolean;
  /** "Vai zerar" mantido por 45 min (ritmo atual esgota os seus bolões antes do fechamento). */
  previsaoZerar: boolean;
  premios: boolean;
  monitoradas: boolean;
  resumoSemanal: boolean;
}

export const PREFERENCIAS_PADRAO: PreferenciasAparelho = { vendas: 'encerramento', resultados: true, previsaoZerar: true, premios: true, monitoradas: true, resumoSemanal: true };

export function lerPreferencias(x: unknown): PreferenciasAparelho {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const bool = (k: keyof PreferenciasAparelho) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (PREFERENCIAS_PADRAO[k] as boolean));
  return {
    vendas: MODOS_VENDAS.some(([m]) => m === o.vendas) ? (o.vendas as ModoVendas) : PREFERENCIAS_PADRAO.vendas,
    resultados: bool('resultados'),
    previsaoZerar: bool('previsaoZerar'),
    premios: bool('premios'),
    monitoradas: bool('monitoradas'),
    resumoSemanal: bool('resumoSemanal'),
  };
}

export interface AlertaAviso {
  /** Chave única por pessoa: o mesmo alerta nunca chega duas vezes. */
  chave: string;
  categoria: Categoria;
  titulo: string;
  corpo: string;
  url: string;
  em: Date;
  /** Lotérica a que o alerta se refere (colaborador restrito a lojas só recebe as dele). */
  lotericaCodigo?: string;
  /** Venda de concurso que sorteia hoje (preferência "vendas de hoje"). */
  hoje?: boolean;
}

/** Este aparelho recebe push deste alerta? (A central recebe tudo que a pessoa pode ver.) */
export function aparelhoAceita(p: PreferenciasAparelho, a: Pick<AlertaAviso, 'categoria' | 'hoje'>): boolean {
  switch (a.categoria) {
    case 'monitorada-abertura':
      return p.monitoradas;
    case 'resumo-semanal':
      return p.resumoSemanal;
    case 'venda':
      return p.vendas === 'todas' || (p.vendas === 'hoje' && !!a.hoje);
    case 'encerramento':
      return p.vendas !== 'nenhuma';
    case 'resultado':
      return p.resultados;
    case 'previsao-zerar':
      return p.previsaoZerar;
    case 'premio':
      return p.premios;
    case 'sistema':
      return true;
  }
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const nomeMod = (m: ModalidadeSlug) => MODALIDADES[m]?.nome ?? m;
const pontos = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
const curta = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

// ---------------------------------------------------------------- abertura das monitoradas

export interface BolaoNaAbertura {
  loterica: LotericaRef;
  aberturaId: string;
  modalidade: ModalidadeSlug;
  concurso: number;
  t0: Date;
  entrouEm: Date;
  posUf?: number | null;
  posCidade?: number | null;
}

/**
 * Push "monitorada entrou na abertura": o 1º bolão de cada lotérica monitorada em cada abertura,
 * dentro de [T0, T0 + janela]. Recebe os bolões novos das monitoradas (em qualquer ordem).
 */
export function alertasDeAbertura(boloes: readonly BolaoNaAbertura[], janelaMin = 30, porPagina = 30): AlertaAviso[] {
  const primeiro = new Map<string, BolaoNaAbertura>();
  for (const b of boloes) {
    const atraso = b.entrouEm.getTime() - b.t0.getTime();
    if (atraso < 0 || atraso > janelaMin * 60_000) continue;
    const k = `${b.aberturaId}|${b.loterica.codigoCaixa}`;
    const atual = primeiro.get(k);
    if (!atual || b.entrouEm.getTime() < atual.entrouEm.getTime()) primeiro.set(k, b);
  }
  return [...primeiro.values()]
    .sort((a, b) => a.entrouEm.getTime() - b.entrouEm.getTime())
    .map((b) => {
      const s = Math.round((b.entrouEm.getTime() - b.t0.getTime()) / 1000);
      const atraso = s < 60 ? `+${s} s` : `+${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
      const pos = b.posUf ? `, ${b.posUf}º em ${b.loterica.uf} (pág. ${Math.ceil(b.posUf / porPagina)})` : '';
      return {
        chave: `abertura:${b.aberturaId}:${b.loterica.codigoCaixa}`,
        categoria: 'monitorada-abertura' as const,
        titulo: `${b.loterica.nome} entrou na abertura`,
        corpo: `${nomeMod(b.modalidade)} ${b.concurso}: 1º bolão às ${horaSP(b.entrouEm)} (${atraso})${pos}.`,
        url: `/aberturas/${b.aberturaId}`,
        em: b.entrouEm,
        lotericaCodigo: b.loterica.codigoCaixa,
      };
    });
}

// ---------------------------------------------------------------- vendas, encerramento, zerar

export interface VendaParaAlerta {
  loterica: LotericaRef;
  modalidade: ModalidadeSlug;
  concurso: number;
  bolaoId: string;
  cotas: number;
  /** Valor recebido (com tarifa). */
  valor: number;
  em: Date;
  /** O concurso sorteia hoje (dia SP do alerta). */
  sorteiaHoje: boolean;
  /** Id do evento de venda no banco: a chave usa o maior, e um reinício do worker não repete o alerta. */
  eventoId?: number;
}

/** Junta as vendas de uma rodada: um alerta por loja (e por "hoje x outros dias"). */
export function alertasDeVendas(vendas: readonly VendaParaAlerta[], ate: Date): AlertaAviso[] {
  const grupos = new Map<string, VendaParaAlerta[]>();
  for (const v of vendas) {
    if (v.cotas <= 0) continue;
    const k = `${v.loterica.codigoCaixa}|${v.sorteiaHoje ? 1 : 0}`;
    grupos.set(k, [...(grupos.get(k) ?? []), v]);
  }
  // uma rodada = um instante (o worker junta as vendas desde a rodada anterior)
  const instante = ate.toISOString();
  return [...grupos.entries()].map(([k, vs]) => {
    const l = vs[0]!.loterica;
    const cotas = vs.reduce((s, v) => s + v.cotas, 0);
    const valor = vs.reduce((s, v) => s + v.valor, 0);
    const boloes = new Set(vs.map((v) => v.bolaoId)).size;
    const concursos = [...new Set(vs.map((v) => `${nomeMod(v.modalidade)} ${v.concurso}`))];
    const ids = vs.map((v) => v.eventoId).filter((x): x is number => typeof x === 'number');
    return {
      chave: `vendas:${k.replace('|', ':')}:${ids.length ? `e${Math.max(...ids)}` : instante}`,
      categoria: 'venda' as const,
      titulo: `${l.nome}: ${cotas} ${cotas === 1 ? 'cota vendida' : 'cotas vendidas'}`,
      corpo: `${moeda.format(valor)} em ${boloes} ${boloes === 1 ? 'bolão' : 'bolões'} (${concursos.slice(0, 3).join(', ')}${concursos.length > 3 ? '…' : ''}).`,
      url: '/minha/boloes',
      em: ate,
      lotericaCodigo: l.codigoCaixa,
      hoje: vs[0]!.sorteiaHoje,
    };
  });
}

export function alertaEncerramento(r: { loterica: LotericaRef; modalidade: ModalidadeSlug; concurso: number; boloes: number; cotasTotal: number; cotasVendidas: number; sobra: number; em: Date }): AlertaAviso {
  const pct = r.cotasTotal ? Math.round((r.cotasVendidas / r.cotasTotal) * 100) : 0;
  return {
    chave: `encerramento:${r.modalidade}-${r.concurso}:${r.loterica.codigoCaixa}`,
    categoria: 'encerramento',
    titulo: `${nomeMod(r.modalidade)} ${r.concurso} encerrou: ${pct}% vendido`,
    corpo: `${r.loterica.nome}: ${r.cotasVendidas} de ${r.cotasTotal} cotas em ${r.boloes} ${r.boloes === 1 ? 'bolão' : 'bolões'}; sobra ${moeda.format(r.sobra)}.`,
    url: '/minha/financeiro',
    em: r.em,
    lotericaCodigo: r.loterica.codigoCaixa,
  };
}

/** Pelo ritmo da última hora, as cotas que restam acabam antes do fechamento? */
export function vaiZerar(o: { restantes: number; vendidasUltimaHora: number; fechaEm: Date; agora: Date }): { zera: boolean; horas: number | null } {
  const horasAteFechar = (o.fechaEm.getTime() - o.agora.getTime()) / 3_600_000;
  if (o.restantes <= 0 || o.vendidasUltimaHora <= 0 || horasAteFechar <= 0) return { zera: false, horas: null };
  const horas = o.restantes / o.vendidasUltimaHora;
  return { zera: horas <= horasAteFechar, horas };
}

export interface EstadoZerar {
  desde: number | null;
  avisado: boolean;
}

/** A previsão precisa se MANTER por 45 min seguidos para avisar (uma vez por concurso). */
export function acompanharZerar(e: EstadoZerar | undefined, zera: boolean, agora: Date, manterMin = 45): { estado: EstadoZerar; avisar: boolean } {
  const atual = e ?? { desde: null, avisado: false };
  if (!zera) return { estado: { desde: null, avisado: atual.avisado }, avisar: false };
  const desde = atual.desde ?? agora.getTime();
  const avisar = !atual.avisado && agora.getTime() - desde >= manterMin * 60_000;
  return { estado: { desde, avisado: atual.avisado || avisar }, avisar };
}

export function alertaZerar(r: { loterica: LotericaRef; modalidade: ModalidadeSlug; concurso: number; restantes: number; horas: number; agora: Date }): AlertaAviso {
  const fim = new Date(r.agora.getTime() + r.horas * 3_600_000);
  return {
    chave: `zerar:${r.modalidade}-${r.concurso}:${r.loterica.codigoCaixa}`,
    categoria: 'previsao-zerar',
    titulo: `${nomeMod(r.modalidade)} ${r.concurso}: seus bolões devem zerar`,
    corpo: `${r.loterica.nome}: no ritmo da última hora, as ${r.restantes} cotas que restam acabam por volta das ${horaSP(fim).slice(0, 5)} (previsão mantida há 45 min). Hora de subir mais?`,
    url: '/minha/boloes',
    em: r.agora,
    lotericaCodigo: r.loterica.codigoCaixa,
  };
}

// ---------------------------------------------------------------- resultados e prêmios

export function alertaResultado(r: { modalidade: ModalidadeSlug; concurso: number; dezenas: readonly number[]; acumulou?: boolean | null; em: Date }): AlertaAviso {
  const dz = r.dezenas.map((d) => String(d).padStart(2, '0')).join(' ');
  return {
    chave: `resultado:${r.modalidade}-${r.concurso}`,
    categoria: 'resultado',
    titulo: `Resultado ${nomeMod(r.modalidade)} ${r.concurso}`,
    corpo: `${dz}${r.acumulou ? ' · acumulou' : ''}`,
    url: '/minha/conferencia',
    em: r.em,
  };
}

export function alertaPremio(r: { loterica: LotericaRef; modalidade: ModalidadeSlug; concurso: number; bolaoId: string; faixa: string; premioTotal: number; premioLoterica: number; em: Date }): AlertaAviso {
  return {
    chave: `premio:${r.bolaoId}`,
    categoria: 'premio',
    titulo: `Saiu prêmio na ${r.loterica.nome}!`,
    corpo: `${nomeMod(r.modalidade)} ${r.concurso}: ${r.faixa}, ${moeda.format(r.premioTotal)} no bolão${r.premioLoterica > 0 ? ` (${moeda.format(r.premioLoterica)} das cotas que sobraram)` : ''}.`,
    url: '/minha/conferencia',
    em: r.em,
    lotericaCodigo: r.loterica.codigoCaixa,
  };
}

// ---------------------------------------------------------------- resumo semanal (segunda 08:00)

/** Segunda-feira 08:00 (SP) da semana de `agora` e a semana anterior (a que o resumo cobre). */
export function resumoSemanalDevido(agora: Date): { devido: boolean; semana: string; enviarEm: Date } {
  const segunda = semanaSP(agora);
  const enviarEm = noDiaSP(segunda, 8, 0);
  return { devido: agora.getTime() >= enviarEm.getTime(), semana: somarDias(segunda, -7), enviarEm };
}

export function alertaResumoSemanal(semana: string, linhas: readonly { loterica: LotericaRef; m: MetricaSemanal }[], em: Date): AlertaAviso | null {
  if (!linhas.length) return null;
  const fim = somarDias(semana, 6);
  const ordem = [...linhas].sort((a, b) => b.m.participacoes - a.m.participacoes || (a.m.atrasoMedianoS ?? 1e9) - (b.m.atrasoMedianoS ?? 1e9));
  const frase = ({ loterica, m }: { loterica: LotericaRef; m: MetricaSemanal }) =>
    m.participacoes
      ? `${loterica.nome}: abriu ${m.participacoes}/${m.aberturasOcorridas} aberturas em ${m.dias.length} dias, atraso mediano ${m.atrasoMedianoS === null ? '—' : `+${Math.round(m.atrasoMedianoS)} s`}, pág. 1 em ${m.pctPagina1 === null ? '—' : `${Math.round(m.pctPagina1 * 100)}%`}`
      : `${loterica.nome}: não abriu`;
  const abriram = linhas.filter((l) => l.m.participacoes > 0).length;
  return {
    chave: `resumo:${semana}`,
    categoria: 'resumo-semanal',
    titulo: `Resumo da semana ${curta(semana)} a ${curta(fim)}: ${abriram} de ${linhas.length} monitoradas abriram`,
    corpo: ordem.slice(0, 4).map(frase).join(' · ') + (ordem.length > 4 ? ` · e mais ${pontos(ordem.length - 4)}` : ''),
    url: `/monitoradas?semana=${semana}`,
    em,
  };
}

/** Dia da semana do resumo (1 = segunda) e hora: para a tela explicar quando chega. */
export const RESUMO_SEMANAL = { isodow: 1, hora: '08:00' } as const;

/** A venda é de um concurso que sorteia hoje? (dia SP do sorteio = dia SP de agora) */
export function sorteiaHoje(sorteioEm: Date | null | undefined, agora: Date): boolean {
  return !!sorteioEm && diaSP(sorteioEm) === diaSP(agora);
}

export const ehSegunda = (agora: Date) => isodowDoDia(diaSP(agora)) === 1;
