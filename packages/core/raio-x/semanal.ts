import type { FaixaPagina } from '../dominio/constantes';
import type { ModalidadeSlug } from '../dominio/modalidades';
import type { Escopo } from '../dominio/tipos';
import { faixaPagina, pagina } from '../regras/posicao';
import { diaSP, horaSP, isodowDoDia, semanaSP, somarDias } from '../tempo/fuso';
import { media, mediana, soma } from '../util/estatistica';

/**
 * Raio-X de Abertura (SPEC, módulo novo): métricas semana a semana de QUALQUER lotérica.
 * Semana = segunda a domingo, fuso America/Sao_Paulo. Tudo aqui é puro e recalculável a partir
 * de `aberturas` + `abertura_participacoes`.
 */

export interface AberturaInfo {
  id: string;
  modalidade: ModalidadeSlug;
  t0: Date;
}

export interface ParticipacaoInfo {
  aberturaId: string;
  lotericaCodigo: string;
  primeiroEm: Date;
  atrasoS: number;
  posCidade: number;
  posUf: number;
  posBrasil: number;
  nBoloes1h: number;
  valor1h: number;
  pctVendido?: number | null;
  sobra?: number | null;
  empate?: boolean;
}

export interface FiltroRaioX {
  /** Instante de referência ("agora"). */
  ate: Date;
  semanas?: number;
  modalidade?: ModalidadeSlug | 'todas';
  escopo?: Escopo;
}

export function posicaoNoEscopo(p: ParticipacaoInfo, escopo: Escopo): number {
  return escopo === 'cidade' ? p.posCidade : escopo === 'uf' ? p.posUf : p.posBrasil;
}

/** Semanas (segundas-feiras, YYYY-MM-DD) das últimas `n` semanas, da mais recente para a mais antiga. */
export function ultimasSemanas(ate: Date, n: number): string[] {
  const atual = semanaSP(ate);
  return Array.from({ length: n }, (_, i) => somarDias(atual, -7 * i));
}

interface Contexto {
  aberturas: Map<string, AberturaInfo>;
  semanas: Set<string>;
  escopo: Escopo;
}

function preparar(aberturas: readonly AberturaInfo[], filtro: FiltroRaioX): Contexto & { semanasOrdem: string[] } {
  const n = filtro.semanas ?? 12;
  const semanasOrdem = ultimasSemanas(filtro.ate, n);
  const semanas = new Set(semanasOrdem);
  const mapa = new Map<string, AberturaInfo>();
  for (const a of aberturas) {
    if (a.t0.getTime() > filtro.ate.getTime()) continue;
    if (filtro.modalidade && filtro.modalidade !== 'todas' && a.modalidade !== filtro.modalidade) continue;
    if (!semanas.has(semanaSP(a.t0))) continue;
    mapa.set(a.id, a);
  }
  return { aberturas: mapa, semanas, semanasOrdem, escopo: filtro.escopo ?? 'uf' };
}

export interface HorarioEntrada {
  dia: string;
  isodow: number;
  modalidade: ModalidadeSlug;
  hora: string;
  atrasoS: number;
  posicao: number;
  pagina: number;
}

export interface MetricaSemanal {
  semana: string;
  aberturasOcorridas: number;
  participacoes: number;
  /** participações / aberturas ocorridas (null se não houve abertura). */
  taxa: number | null;
  /** Dias ISO (1 = seg ... 7 = dom) em que abriu. */
  dias: number[];
  horarios: HorarioEntrada[];
  atrasoMedianoS: number | null;
  melhorPosicao: number | null;
  posicaoMediana: number | null;
  pctPagina1: number | null;
  nBoloes1h: number;
  valor1h: number;
  pctVendido: number | null;
  sobra: number | null;
}

export function metricasSemanais(
  lotericaCodigo: string,
  aberturas: readonly AberturaInfo[],
  participacoes: readonly ParticipacaoInfo[],
  filtro: FiltroRaioX,
): MetricaSemanal[] {
  const ctx = preparar(aberturas, filtro);
  const ocorridas = new Map<string, number>();
  for (const a of ctx.aberturas.values()) {
    const s = semanaSP(a.t0);
    ocorridas.set(s, (ocorridas.get(s) ?? 0) + 1);
  }
  const porSemana = new Map<string, { p: ParticipacaoInfo; a: AberturaInfo }[]>();
  for (const p of participacoes) {
    if (p.lotericaCodigo !== lotericaCodigo) continue;
    const a = ctx.aberturas.get(p.aberturaId);
    if (!a) continue;
    const s = semanaSP(a.t0);
    const lista = porSemana.get(s);
    if (lista) lista.push({ p, a });
    else porSemana.set(s, [{ p, a }]);
  }

  return ctx.semanasOrdem.map((semana) => {
    const lista = (porSemana.get(semana) ?? []).sort((x, y) => x.a.t0.getTime() - y.a.t0.getTime());
    const nOc = ocorridas.get(semana) ?? 0;
    const posicoes = lista.map(({ p }) => posicaoNoEscopo(p, ctx.escopo));
    const vendidos = lista.map(({ p }) => p.pctVendido).filter((v): v is number => v !== null && v !== undefined);
    const sobras = lista.map(({ p }) => p.sobra).filter((v): v is number => v !== null && v !== undefined);
    return {
      semana,
      aberturasOcorridas: nOc,
      participacoes: lista.length,
      taxa: nOc > 0 ? lista.length / nOc : null,
      dias: [...new Set(lista.map(({ a }) => isodowDoDia(diaSP(a.t0))))].sort((x, y) => x - y),
      horarios: lista.map(({ p, a }) => {
        const pos = posicaoNoEscopo(p, ctx.escopo);
        return {
          dia: diaSP(a.t0),
          isodow: isodowDoDia(diaSP(a.t0)),
          modalidade: a.modalidade,
          hora: horaSP(p.primeiroEm),
          atrasoS: p.atrasoS,
          posicao: pos,
          pagina: pagina(pos),
        };
      }),
      atrasoMedianoS: mediana(lista.map(({ p }) => p.atrasoS)),
      melhorPosicao: posicoes.length ? Math.min(...posicoes) : null,
      posicaoMediana: mediana(posicoes),
      pctPagina1: posicoes.length ? posicoes.filter((x) => pagina(x) === 1).length / posicoes.length : null,
      nBoloes1h: soma(lista.map(({ p }) => p.nBoloes1h)),
      valor1h: Math.round(soma(lista.map(({ p }) => p.valor1h)) * 100) / 100,
      pctVendido: media(vendidos),
      sobra: sobras.length ? Math.round(soma(sobras) * 100) / 100 : null,
    };
  });
}

export interface Tendencia {
  atual: number;
  mediaAnteriores: number | null;
  /** atual − média das 4 anteriores. */
  variacao: number | null;
  /** A semana atual ainda não terminou (comparação parcial). */
  semanaParcial: boolean;
}

/** Tendência: semana atual x média das 4 anteriores (métricas em ordem da mais recente). */
export function tendencia(
  metricas: readonly MetricaSemanal[],
  campo: 'participacoes' | 'posicaoMediana' | 'atrasoMedianoS' = 'participacoes',
  ate?: Date,
): Tendencia {
  const valor = (m: MetricaSemanal | undefined) => (m ? m[campo] : null);
  const atual = valor(metricas[0]) ?? 0;
  const anteriores = metricas
    .slice(1, 5)
    .map(valor)
    .filter((v): v is number => v !== null);
  const m = media(anteriores);
  const semanaParcial = ate && metricas[0] ? isodowDoDia(diaSP(ate)) !== 7 || horaSP(ate) < '23:59:59' : false;
  return { atual, mediaAnteriores: m, variacao: m === null ? null : atual - m, semanaParcial };
}

export interface ChanceDeAbrir {
  dia: string;
  isodow: number;
  /** Semanas (das últimas N) em que houve abertura naquele dia da semana. */
  semanasComAbertura: number;
  /** Dessas, em quantas a lotérica abriu. */
  semanasQueAbriu: number;
  chance: number | null;
}

/**
 * Chance de abrir em `dia` (ex.: amanhã) = frequência com que a lotérica abriu naquele dia da
 * semana nas últimas `semanas` semanas (default 8), contando só semanas em que houve abertura.
 */
export function chanceDeAbrir(
  lotericaCodigo: string,
  dia: string,
  aberturas: readonly AberturaInfo[],
  participacoes: readonly ParticipacaoInfo[],
  opcoes: { semanas?: number; modalidade?: ModalidadeSlug | 'todas' } = {},
): ChanceDeAbrir {
  const n = opcoes.semanas ?? 8;
  const isodow = isodowDoDia(dia);
  const diasAlvo = new Set(Array.from({ length: n }, (_, i) => somarDias(dia, -7 * (i + 1))));
  const aberturasNoDia = new Map<string, string>(); // aberturaId -> dia
  const diasComAbertura = new Set<string>();
  for (const a of aberturas) {
    if (opcoes.modalidade && opcoes.modalidade !== 'todas' && a.modalidade !== opcoes.modalidade) continue;
    const d = diaSP(a.t0);
    if (!diasAlvo.has(d)) continue;
    aberturasNoDia.set(a.id, d);
    diasComAbertura.add(d);
  }
  const diasQueAbriu = new Set<string>();
  for (const p of participacoes) {
    if (p.lotericaCodigo !== lotericaCodigo) continue;
    const d = aberturasNoDia.get(p.aberturaId);
    if (d) diasQueAbriu.add(d);
  }
  return {
    dia,
    isodow,
    semanasComAbertura: diasComAbertura.size,
    semanasQueAbriu: diasQueAbriu.size,
    chance: diasComAbertura.size > 0 ? diasQueAbriu.size / diasComAbertura.size : null,
  };
}

export interface CelulaGrade {
  dia: string;
  isodow: number;
  aberturasNoDia: number;
  participacoesNoDia: number;
  houveAbertura: boolean;
  participou: boolean;
  /** Dados da participação escolhida (melhor colocação no escopo; empate -> menor atraso). */
  hora?: string;
  atrasoS?: number;
  posicao?: number;
  pagina?: number;
  faixa?: FaixaPagina;
  modalidade?: ModalidadeSlug;
  empate?: boolean;
}

export interface LinhaGrade {
  semana: string;
  celulas: CelulaGrade[]; // 7 colunas: seg..dom
  total: number;
  aberturasOcorridas: number;
  melhor: number | null;
  mediana: number | null;
}

/**
 * Grade da aba "Aberturas" (tela 1): uma linha por semana (últimas 12), uma coluna por dia.
 * Com modalidade = 'todas' a célula consolida o dia mostrando a MELHOR colocação no escopo.
 */
export function gradeSemanal(
  lotericaCodigo: string,
  aberturas: readonly AberturaInfo[],
  participacoes: readonly ParticipacaoInfo[],
  filtro: FiltroRaioX,
): LinhaGrade[] {
  const ctx = preparar(aberturas, filtro);
  const aberturasPorDia = new Map<string, number>();
  for (const a of ctx.aberturas.values()) {
    const d = diaSP(a.t0);
    aberturasPorDia.set(d, (aberturasPorDia.get(d) ?? 0) + 1);
  }
  const partsPorDia = new Map<string, { p: ParticipacaoInfo; a: AberturaInfo }[]>();
  for (const p of participacoes) {
    if (p.lotericaCodigo !== lotericaCodigo) continue;
    const a = ctx.aberturas.get(p.aberturaId);
    if (!a) continue;
    const d = diaSP(a.t0);
    const lista = partsPorDia.get(d);
    if (lista) lista.push({ p, a });
    else partsPorDia.set(d, [{ p, a }]);
  }

  return ctx.semanasOrdem.map((semana) => {
    const celulas: CelulaGrade[] = [];
    const posicoes: number[] = [];
    let total = 0;
    let ocorridas = 0;
    for (let i = 0; i < 7; i++) {
      const dia = somarDias(semana, i);
      const nAb = aberturasPorDia.get(dia) ?? 0;
      const parts = partsPorDia.get(dia) ?? [];
      ocorridas += nAb;
      total += parts.length;
      const cel: CelulaGrade = {
        dia,
        isodow: i + 1,
        aberturasNoDia: nAb,
        participacoesNoDia: parts.length,
        houveAbertura: nAb > 0,
        participou: parts.length > 0,
      };
      if (parts.length) {
        const melhor = [...parts].sort(
          (x, y) => posicaoNoEscopo(x.p, ctx.escopo) - posicaoNoEscopo(y.p, ctx.escopo) || x.p.atrasoS - y.p.atrasoS,
        )[0]!;
        const pos = posicaoNoEscopo(melhor.p, ctx.escopo);
        const pg = pagina(pos);
        Object.assign(cel, {
          hora: horaSP(melhor.p.primeiroEm),
          atrasoS: melhor.p.atrasoS,
          posicao: pos,
          pagina: pg,
          faixa: faixaPagina(pg),
          modalidade: melhor.a.modalidade,
          empate: melhor.p.empate ?? false,
        });
        for (const { p } of parts) posicoes.push(posicaoNoEscopo(p, ctx.escopo));
      }
      celulas.push(cel);
    }
    return {
      semana,
      celulas,
      total,
      aberturasOcorridas: ocorridas,
      melhor: posicoes.length ? Math.min(...posicoes) : null,
      mediana: mediana(posicoes),
    };
  });
}
