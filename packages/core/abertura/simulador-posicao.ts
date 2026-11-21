import { BOLOES_POR_PAGINA } from '../dominio/constantes';
import { formatarCodigoBolao } from '../dominio/codigo-bolao';
import { semAcento } from '../dominio/jogo';
import type { ModalidadeSlug } from '../dominio/modalidades';
import type { LotericaRef } from '../dominio/tipos';
import type { AberturaInfo, ParticipacaoInfo } from '../raio-x/semanal';
import { diaSP, isodowDoDia, somarDias, t0Padrao } from '../tempo/fuso';
import { centavos, mediana, percentil } from '../util/estatistica';

/**
 * Simulador de posição ("se eu entrar às 21:45:30, em que página caio?") e Cronômetro de abertura.
 *
 * Na vitrine, o 1º bolão de cada lotérica forma a 1ª fila, na ordem de chegada. Então, se o seu
 * 1º bolão entrar x segundos depois de T0, a sua posição no escopo (cidade, UF, Brasil) é 1 + o
 * número de outras lotéricas do escopo cujo 1º bolão chegou antes de x. Refazendo isso para cada
 * abertura passada do mesmo dia da semana (curva de chegada real), sai a distribuição da posição.
 */
export type EscopoPosicao = 'cidade' | 'uf' | 'brasil';

export interface PosicaoSimulada {
  escopo: EscopoPosicao;
  aberturas: number;
  posicaoMediana: number | null;
  /** Melhor e pior caso plausíveis (percentis 10 e 90). */
  posicaoP10: number | null;
  posicaoP90: number | null;
  paginaMediana: number | null;
  chancePagina1: number | null;
}

export interface SimulacaoPosicao {
  atrasoS: number;
  diaSemana: number;
  modalidade: ModalidadeSlug | 'todas';
  porEscopo: PosicaoSimulada[];
  /** Até quantos segundos depois de T0 dá para ficar na pág. 1 (chance >= 50% e >= 80%). */
  limitePagina1: Record<EscopoPosicao, { metade: number | null; quase: number | null }>;
  /** Curva: posição mediana por segundo de entrada (para o gráfico). */
  curva: { atrasoS: number; uf: number | null; brasil: number | null; cidade: number | null }[];
}

const norm = (s: string) => semAcento(s).toLowerCase().trim();

interface AberturaPreparada {
  /** Atrasos (s) ordenados das OUTRAS lotéricas, por escopo. */
  cidade: number[];
  uf: number[];
  brasil: number[];
}

function contarAntes(ordenados: number[], x: number): number {
  let lo = 0;
  let hi = ordenados.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ordenados[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function prepararAberturas(o: {
  aberturas: readonly AberturaInfo[];
  participacoes: readonly ParticipacaoInfo[];
  localDe: (codigo: string) => Pick<LotericaRef, 'cidade' | 'uf'> | undefined;
  minha: Pick<LotericaRef, 'codigoCaixa' | 'cidade' | 'uf'>;
  modalidade: ModalidadeSlug | 'todas';
  diaSemana: number;
  ate: Date;
  semanas?: number;
}): AberturaPreparada[] {
  const desde = somarDias(diaSP(o.ate), -7 * (o.semanas ?? 8));
  const alvo = o.aberturas.filter(
    (a) => (o.modalidade === 'todas' || a.modalidade === o.modalidade) && a.t0.getTime() < o.ate.getTime() && diaSP(a.t0) >= desde && isodowDoDia(diaSP(a.t0)) === o.diaSemana,
  );
  const porAbertura = new Map<string, ParticipacaoInfo[]>();
  for (const p of o.participacoes) {
    const l = porAbertura.get(p.aberturaId);
    if (l) l.push(p);
    else porAbertura.set(p.aberturaId, [p]);
  }
  const cid = norm(o.minha.cidade);
  return alvo.map((a) => {
    const prep: AberturaPreparada = { cidade: [], uf: [], brasil: [] };
    for (const p of porAbertura.get(a.id) ?? []) {
      if (p.lotericaCodigo === o.minha.codigoCaixa) continue;
      prep.brasil.push(p.atrasoS);
      const loc = o.localDe(p.lotericaCodigo);
      if (loc?.uf === o.minha.uf) {
        prep.uf.push(p.atrasoS);
        if (norm(loc.cidade) === cid) prep.cidade.push(p.atrasoS);
      }
    }
    for (const k of ['cidade', 'uf', 'brasil'] as const) prep[k].sort((x, y) => x - y);
    return prep;
  });
}

function posicoes(prep: readonly AberturaPreparada[], escopo: EscopoPosicao, x: number): number[] {
  return prep.map((a) => 1 + contarAntes(a[escopo], x));
}

export function simularPosicao(prep: readonly AberturaPreparada[], o: { atrasoS: number; diaSemana: number; modalidade: ModalidadeSlug | 'todas' }): SimulacaoPosicao {
  const escopos: EscopoPosicao[] = ['cidade', 'uf', 'brasil'];
  const resumo = (escopo: EscopoPosicao): PosicaoSimulada => {
    const ps = posicoes(prep, escopo, o.atrasoS);
    const med = mediana(ps);
    return {
      escopo,
      aberturas: ps.length,
      posicaoMediana: med === null ? null : Math.round(med),
      posicaoP10: ps.length ? Math.round(percentil(ps, 0.1)!) : null,
      posicaoP90: ps.length ? Math.round(percentil(ps, 0.9)!) : null,
      paginaMediana: med === null ? null : Math.ceil(Math.round(med) / BOLOES_POR_PAGINA),
      chancePagina1: ps.length ? ps.filter((p) => p <= BOLOES_POR_PAGINA).length / ps.length : null,
    };
  };
  const grade = [...Array.from({ length: 61 }, (_, i) => i * 5), ...Array.from({ length: 25 }, (_, i) => 330 + i * 60)];
  const chance = (escopo: EscopoPosicao, x: number) => {
    const ps = posicoes(prep, escopo, x);
    return ps.length ? ps.filter((p) => p <= BOLOES_POR_PAGINA).length / ps.length : 0;
  };
  const limite = (escopo: EscopoPosicao, min: number) => {
    if (!prep.length) return null;
    let ultimo: number | null = null;
    for (let x = 0; x <= 1800; x += 1) {
      if (chance(escopo, x) >= min) ultimo = x;
      else break;
    }
    return ultimo;
  };
  return {
    atrasoS: o.atrasoS,
    diaSemana: o.diaSemana,
    modalidade: o.modalidade,
    porEscopo: escopos.map(resumo),
    limitePagina1: Object.fromEntries(escopos.map((e) => [e, { metade: limite(e, 0.5), quase: limite(e, 0.8) }])) as SimulacaoPosicao['limitePagina1'],
    curva: grade.map((x) => {
      const m = (e: EscopoPosicao) => {
        const v = mediana(posicoes(prep, e, x));
        return v === null ? null : Math.round(v);
      };
      return { atrasoS: x, cidade: m('cidade'), uf: m('uf'), brasil: m('brasil') };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Cronômetro de abertura

export interface ProximaAbertura {
  t0: Date;
  /** Quando avisar (padrão: 2 min antes, 21:43 nas noites e 11:43 no domingo). */
  alertaEm: Date;
  emAndamento: boolean;
  /** Segundos até T0 (negativo se já começou). */
  faltaS: number;
}

/** Próxima abertura (ou a que está em andamento, até T0 + 60 min) pelo horário padrão de T0. */
export function proximaAbertura(agora: Date, o: { alertaAntesMin?: number; janelaMin?: number; t0Do?: (dia: string) => Date } = {}): ProximaAbertura {
  const t0Do = o.t0Do ?? t0Padrao;
  const janela = (o.janelaMin ?? 60) * 60_000;
  let dia = diaSP(agora);
  let t0 = t0Do(dia);
  if (agora.getTime() >= t0.getTime() + janela) {
    dia = somarDias(dia, 1);
    t0 = t0Do(dia);
  }
  return {
    t0,
    alertaEm: new Date(t0.getTime() - (o.alertaAntesMin ?? 2) * 60_000),
    emAndamento: agora.getTime() >= t0.getTime(),
    faltaS: Math.round((t0.getTime() - agora.getTime()) / 1000),
  };
}

export interface BolaoPreMontado {
  id: string;
  descricao?: string;
  jogos: number;
  dezenas: number;
  cotas: number;
  valorCota: number;
}

/**
 * Fila de bolões pré-montados: o MAIS VALIOSO primeiro, porque o 1º bolão define a sua posição na
 * 1ª fila (a mais vista); os demais vão para a 2ª, 3ª fila...
 */
export function ordenarFilaPreMontada(boloes: readonly BolaoPreMontado[]) {
  return [...boloes]
    .map((b) => ({ ...b, valorTotal: centavos(b.cotas * b.valorCota), formato: formatarCodigoBolao({ jogos: b.jogos, dezenas: b.dezenas, cotas: b.cotas }) }))
    .sort((a, b) => b.valorTotal - a.valorTotal || b.cotas - a.cotas || a.id.localeCompare(b.id))
    .map((b, i) => ({ ...b, ordem: i + 1, fila: i + 1 }));
}
