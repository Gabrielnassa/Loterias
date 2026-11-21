import type { ModalidadeSlug } from '../dominio/modalidades';
import type { Escopo, LotericaRef } from '../dominio/tipos';
import { normalizarTexto, pagina } from '../regras/posicao';
import { diaSP } from '../tempo/fuso';
import { mediana } from '../util/estatistica';
import { posicaoNoEscopo, type AberturaInfo, type ParticipacaoInfo } from './semanal';

/** Ranking da abertura por cidade/UF e período (tela 4). */
export type CriterioRanking = 'mais_aberturas' | 'mais_rapida' | 'mais_pagina1';

export interface FiltroRanking {
  de: Date;
  ate: Date;
  uf?: string;
  cidade?: string;
  modalidade?: ModalidadeSlug | 'todas';
  escopo?: Escopo;
}

export interface LinhaRanking {
  posicao: number;
  loterica: LotericaRef;
  participacoes: number;
  aberturasOcorridas: number;
  taxa: number;
  atrasoMedianoS: number | null;
  melhorPosicao: number | null;
  posicaoMediana: number | null;
  pctPagina1: number | null;
}

function aberturasNoPeriodo(aberturas: readonly AberturaInfo[], f: FiltroRanking): Map<string, AberturaInfo> {
  const m = new Map<string, AberturaInfo>();
  for (const a of aberturas) {
    const t = a.t0.getTime();
    if (t < f.de.getTime() || t > f.ate.getTime()) continue;
    if (f.modalidade && f.modalidade !== 'todas' && a.modalidade !== f.modalidade) continue;
    m.set(a.id, a);
  }
  return m;
}

function noLocal(l: LotericaRef, f: { uf?: string; cidade?: string }): boolean {
  if (f.uf && normalizarTexto(l.uf) !== normalizarTexto(f.uf)) return false;
  if (f.cidade && normalizarTexto(l.cidade) !== normalizarTexto(f.cidade)) return false;
  return true;
}

export function rankingAberturas(
  aberturas: readonly AberturaInfo[],
  participacoes: readonly ParticipacaoInfo[],
  lotericas: ReadonlyMap<string, LotericaRef>,
  filtro: FiltroRanking,
  criterio: CriterioRanking,
): LinhaRanking[] {
  const escopo = filtro.escopo ?? 'uf';
  const periodo = aberturasNoPeriodo(aberturas, filtro);
  const porLoterica = new Map<string, ParticipacaoInfo[]>();
  for (const p of participacoes) {
    if (!periodo.has(p.aberturaId)) continue;
    const l = lotericas.get(p.lotericaCodigo);
    if (!l || !noLocal(l, filtro)) continue;
    const lista = porLoterica.get(p.lotericaCodigo);
    if (lista) lista.push(p);
    else porLoterica.set(p.lotericaCodigo, [p]);
  }
  const linhas = [...porLoterica.entries()].map(([cod, ps]) => {
    const pos = ps.map((p) => posicaoNoEscopo(p, escopo));
    return {
      posicao: 0,
      loterica: lotericas.get(cod)!,
      participacoes: ps.length,
      aberturasOcorridas: periodo.size,
      taxa: periodo.size ? ps.length / periodo.size : 0,
      atrasoMedianoS: mediana(ps.map((p) => p.atrasoS)),
      melhorPosicao: pos.length ? Math.min(...pos) : null,
      posicaoMediana: mediana(pos),
      pctPagina1: pos.length ? pos.filter((x) => pagina(x) === 1).length / pos.length : null,
    } satisfies LinhaRanking;
  });

  const inf = Number.POSITIVE_INFINITY;
  const cmp: Record<CriterioRanking, (a: LinhaRanking, b: LinhaRanking) => number> = {
    mais_aberturas: (a, b) => b.participacoes - a.participacoes || (a.atrasoMedianoS ?? inf) - (b.atrasoMedianoS ?? inf),
    mais_rapida: (a, b) => (a.atrasoMedianoS ?? inf) - (b.atrasoMedianoS ?? inf) || b.participacoes - a.participacoes,
    mais_pagina1: (a, b) =>
      (b.pctPagina1 ?? -1) - (a.pctPagina1 ?? -1) || b.participacoes - a.participacoes || (a.posicaoMediana ?? inf) - (b.posicaoMediana ?? inf),
  };
  linhas.sort((a, b) => cmp[criterio](a, b) || a.loterica.codigoCaixa.localeCompare(b.loterica.codigoCaixa));
  linhas.forEach((l, i) => (l.posicao = i + 1));
  return linhas;
}

export interface DiaComparado {
  dia: string;
  /** Melhor participação (menor atraso) de cada lotérica no dia; ausente = não abriu. */
  porLoterica: Record<string, { atrasoS: number; posicao: number; aberturaId: string } | undefined>;
  /** Quem chegou primeiro no dia (menor atraso; empate -> melhor colocação). null = ninguém abriu. */
  primeiro: string | null;
}

export const MAX_COMPARADAS = 6; // você + até 5 concorrentes

/** Comparar (tela 3): você + até 5 concorrentes, "quem chegou primeiro" por dia. */
export function compararLotericas(
  codigos: readonly string[],
  aberturas: readonly AberturaInfo[],
  participacoes: readonly ParticipacaoInfo[],
  filtro: FiltroRanking,
): DiaComparado[] {
  if (codigos.length > MAX_COMPARADAS) throw new RangeError(`no máximo ${MAX_COMPARADAS} lotéricas`);
  const escopo = filtro.escopo ?? 'uf';
  const periodo = aberturasNoPeriodo(aberturas, filtro);
  const alvo = new Set(codigos);
  const dias = new Map<string, DiaComparado>();
  for (const a of periodo.values()) {
    const d = diaSP(a.t0);
    if (!dias.has(d)) dias.set(d, { dia: d, porLoterica: Object.fromEntries(codigos.map((c) => [c, undefined])), primeiro: null });
  }
  for (const p of participacoes) {
    if (!alvo.has(p.lotericaCodigo)) continue;
    const a = periodo.get(p.aberturaId);
    if (!a) continue;
    const dia = dias.get(diaSP(a.t0))!;
    const atual = dia.porLoterica[p.lotericaCodigo];
    const pos = posicaoNoEscopo(p, escopo);
    if (!atual || p.atrasoS < atual.atrasoS || (p.atrasoS === atual.atrasoS && pos < atual.posicao)) {
      dia.porLoterica[p.lotericaCodigo] = { atrasoS: p.atrasoS, posicao: pos, aberturaId: p.aberturaId };
    }
  }
  for (const dia of dias.values()) {
    let melhor: string | null = null;
    for (const c of codigos) {
      const v = dia.porLoterica[c];
      if (!v) continue;
      const m = melhor ? dia.porLoterica[melhor]! : null;
      if (!m || v.atrasoS < m.atrasoS || (v.atrasoS === m.atrasoS && v.posicao < m.posicao)) melhor = c;
    }
    dia.primeiro = melhor;
  }
  return [...dias.values()].sort((a, b) => (a.dia < b.dia ? 1 : -1));
}
