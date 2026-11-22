import { BOLOES_POR_PAGINA } from '../dominio/constantes';
import { semAcento } from '../dominio/jogo';

/**
 * Escopos da vitrine do Marketplace (observado em 21/11/2026, conta logada na cidade de São Paulo):
 * a lista começa pelos bolões da CIDADE do comprador; depois da última página da cidade, o botão
 * "Seguinte" carrega a página 1 do RESTO DO ESTADO (novo totalRegistros e nova numeração); e,
 * provavelmente, depois vem o resto do BRASIL. Ex.: Mega-Sena 3089, cidade 543 bolões/19 págs.,
 * estado 2.657/89 págs.
 */
export type EscopoVitrine = 'cidade' | 'estado' | 'brasil';
export const ESCOPOS_VITRINE: readonly EscopoVitrine[] = ['cidade', 'estado', 'brasil'];

/** Cabeçalho de uma página da lista, como a fonte informa (numeração do escopo). */
export interface CabecalhoPagina {
  paginaAtual: number;
  ultimaPagina: number;
  totalRegistros: number;
}

/** Um escopo já visto na navegação: começa na página GLOBAL `inicio` (contando desde a 1ª da cidade). */
export interface EscopoNaNavegacao extends CabecalhoPagina {
  inicio: number;
}

export interface PosicaoNoEscopo {
  indice: number;
  nome: EscopoVitrine;
  pagina: number;
  totalPaginas: number;
  totalItens: number;
}

/**
 * Atualiza os escopos vistos ao chegar na página GLOBAL `global` com o cabeçalho `c`. A página 1 de um
 * escopo depois da 1ª global abre um escopo novo. Devolve os escopos e em qual deles a página está.
 */
export function registrarEscopo(escopos: readonly EscopoNaNavegacao[], global: number, c: CabecalhoPagina): { escopos: EscopoNaNavegacao[]; indice: number } {
  if (global === 1 || !escopos.length) return { escopos: [{ inicio: 1, ...c }], indice: 0 };
  const lista = [...escopos];
  // em qual escopo conhecido a página global cai, pela numeração
  for (let i = lista.length - 1; i >= 0; i--) {
    const e = lista[i]!;
    if (global >= e.inicio && c.paginaAtual === global - e.inicio + 1) {
      lista[i] = { ...e, ...c };
      return { escopos: lista.slice(0, i + 1).concat(lista.slice(i + 1)), indice: i };
    }
  }
  if (c.paginaAtual === 1) {
    // escopo novo logo depois do último conhecido (o que vier depois dele é descartado)
    const ate = lista.findIndex((e) => e.inicio >= global);
    const base = ate === -1 ? lista : lista.slice(0, ate);
    base.push({ inicio: global, ...c });
    return { escopos: base, indice: base.length - 1 };
  }
  // numeração inconsistente (navegação fora de ordem): recomeça a contagem neste ponto
  return { escopos: [...lista, { inicio: global - c.paginaAtual + 1, ...c }], indice: lista.length };
}

/** Escopo de cada página numa sequência lida em ordem (página global 1, 2, 3...). */
export function escoposDaSequencia(cabecalhos: readonly CabecalhoPagina[]): PosicaoNoEscopo[] {
  let escopos: EscopoNaNavegacao[] = [];
  return cabecalhos.map((c, i) => {
    const r = registrarEscopo(escopos, i + 1, c);
    escopos = r.escopos;
    return { indice: r.indice, nome: ESCOPOS_VITRINE[Math.min(r.indice, 2)]!, pagina: c.paginaAtual, totalPaginas: c.ultimaPagina, totalItens: c.totalRegistros };
  });
}

/** Total de páginas GLOBAIS conhecido (cidade + escopos seguintes já vistos). */
export function paginasConhecidas(escopos: readonly EscopoNaNavegacao[]): number {
  const u = escopos.at(-1);
  return u ? u.inicio + u.ultimaPagina - 1 : 0;
}

const norm = (s: string) => semAcento(s).toLowerCase().trim();

export interface ItemDaVitrine {
  id: string;
  fila: number;
  loterica: { cidade: string; uf: string };
}

export interface SegmentoDaVitrine<T> {
  escopo: EscopoVitrine;
  totalItens: number;
  totalPaginas: number;
  itens: { item: T; posicao: number; pagina: number }[];
}

/**
 * A vitrine que um COMPRADOR de `cidade`/`uf` vê: os bolões da cidade dele, depois os do resto do
 * estado, depois os do resto do Brasil; cada escopo com a própria numeração de posição e página.
 * `ordenar` é a regra de ordem dentro do escopo (ver regras/ordem-vitrine.ts).
 */
export function vitrineDoComprador<T extends ItemDaVitrine>(
  itens: readonly T[],
  comprador: { cidade: string; uf: string },
  ordenar: (a: T, b: T) => number,
  porPagina = BOLOES_POR_PAGINA,
): SegmentoDaVitrine<T>[] {
  const cid = norm(comprador.cidade);
  const uf = comprador.uf.toUpperCase();
  const grupos: Record<EscopoVitrine, T[]> = { cidade: [], estado: [], brasil: [] };
  for (const it of itens) {
    const mesmaUf = it.loterica.uf.toUpperCase() === uf;
    grupos[mesmaUf && norm(it.loterica.cidade) === cid ? 'cidade' : mesmaUf ? 'estado' : 'brasil'].push(it);
  }
  return ESCOPOS_VITRINE.map((escopo) => {
    const lista = [...grupos[escopo]].sort(ordenar);
    return {
      escopo,
      totalItens: lista.length,
      totalPaginas: Math.ceil(lista.length / porPagina),
      itens: lista.map((item, i) => ({ item, posicao: i + 1, pagina: Math.ceil((i + 1) / porPagina) })),
    };
  });
}
