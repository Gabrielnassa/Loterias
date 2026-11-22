import { posicaoEsperadaNoBloco, REGRA_ORDEM_PADRAO, type RegraOrdemVitrine } from './ordem-vitrine';
import { BOLOES_POR_PAGINA, type FaixaPagina } from '../dominio/constantes';
import type { ColocacaoPorEscopo, Escopo } from '../dominio/tipos';
import { compararChegada, type BolaoParaFila } from './fila';

/** Página = teto(posição / 30). Posição é 1-based. */
export function pagina(posicao: number, porPagina = BOLOES_POR_PAGINA): number {
  if (!Number.isFinite(posicao) || posicao < 1) throw new RangeError(`posição inválida: ${posicao}`);
  return Math.ceil(posicao / porPagina);
}

/** Faixa de cor da grade do Raio-X: pág. 1, 2-3, 4+. */
export function faixaPagina(p: number): FaixaPagina {
  if (p <= 1) return 'pag1';
  if (p <= 3) return 'pag2-3';
  return 'pag4+';
}

/** Normaliza nomes de cidade/UF para comparar escopos ("São Paulo" == "SAO PAULO"). */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface LocalLoterica {
  cidade: string;
  uf: string;
}

/** Chave do escopo de uma lotérica: Brasil, UF ou cidade (cidade é qualificada pela UF). */
export function chaveEscopo(escopo: Escopo, l: LocalLoterica): string {
  switch (escopo) {
    case 'brasil':
      return 'BR';
    case 'uf':
      return `UF:${normalizarTexto(l.uf)}`;
    case 'cidade':
      return `CID:${normalizarTexto(l.uf)}/${normalizarTexto(l.cidade)}`;
  }
}

export interface BolaoNaVitrine extends BolaoParaFila {
  loterica: LocalLoterica;
  fila: number;
  /** Quando deixou a vitrine (esgotou ou sumiu). null/undefined = ainda visível. */
  saiuEm?: Date | null;
}

/** Ordem da vitrine: 1ª fila inteira antes da 2ª; dentro da fila, ordem de chegada (hipótese; ver ordem-vitrine.ts). */
export function compararVitrine(a: BolaoNaVitrine, b: BolaoNaVitrine): number {
  if (a.fila !== b.fila) return a.fila - b.fila;
  return compararChegada(a, b);
}

function visivelEm(b: BolaoNaVitrine, em: Date | undefined): boolean {
  if (em === undefined) return !b.saiuEm;
  if (b.firstSeenAt.getTime() > em.getTime()) return false;
  return !b.saiuEm || b.saiuEm.getTime() > em.getTime();
}

function colocacao(posicao: number, porPagina: number) {
  return { posicao, pagina: pagina(posicao, porPagina) };
}

/**
 * Posição CALCULADA de cada bolão visível, nos 3 escopos.
 * Regra: ordenar os bolões visíveis do escopo por (fila, first_seen_at) e pegar o índice.
 * `em`: instante de referência (default: estado atual, i.e. quem não saiu da vitrine).
 */
export function calcularPosicoes(
  boloes: readonly BolaoNaVitrine[],
  em?: Date,
  porPagina = BOLOES_POR_PAGINA,
  regra: RegraOrdemVitrine = REGRA_ORDEM_PADRAO,
): Map<string, ColocacaoPorEscopo> {
  const visiveis = boloes.filter((b) => visivelEm(b, em)).sort(compararVitrine);
  const contagem = new Map<string, number>();
  const res = new Map<string, ColocacaoPorEscopo>();
  // fila aleatória: a posição é o meio do bloco da fila no escopo
  const blocos = new Map<string, { inicio: number; tamanho: number }>();
  if (regra === 'fila-aleatoria') {
    const n = new Map<string, number>();
    for (const b of visiveis) {
      for (const escopo of ['brasil', 'uf', 'cidade'] as const) {
        const k = chaveEscopo(escopo, b.loterica);
        const pos = (n.get(k) ?? 0) + 1;
        n.set(k, pos);
        const kb = `${k}|${b.fila}`;
        const bl = blocos.get(kb);
        if (bl) bl.tamanho++;
        else blocos.set(kb, { inicio: pos, tamanho: 1 });
      }
    }
  }
  for (const b of visiveis) {
    const c = {} as ColocacaoPorEscopo;
    for (const escopo of ['brasil', 'uf', 'cidade'] as const) {
      const k = chaveEscopo(escopo, b.loterica);
      const n = (contagem.get(k) ?? 0) + 1;
      contagem.set(k, n);
      const bl = blocos.get(`${k}|${b.fila}`);
      c[escopo] = colocacao(bl ? posicaoEsperadaNoBloco(bl.inicio, bl.tamanho) : n, porPagina);
    }
    res.set(b.id, c);
  }
  return res;
}

export interface ItemObservado {
  id: string;
  loterica: LocalLoterica;
  /** Posição 1-based na resposta da fonte (escopo Brasil), quando a fonte devolve a ordem da vitrine. */
  posicaoObservada: number;
}

/**
 * Posição OBSERVADA nos 3 escopos a partir da ordem devolvida pela fonte numa varredura
 * Brasil. Brasil = posição observada; UF/cidade = índice dentro do escopo na mesma ordem.
 * Requer que os itens sejam um prefixo contíguo da vitrine (a varredura lê da pág. 1 em diante).
 */
export function posicoesObservadas(
  itens: readonly ItemObservado[],
  porPagina = BOLOES_POR_PAGINA,
): Map<string, ColocacaoPorEscopo> {
  const ordenados = [...itens].sort((a, b) => a.posicaoObservada - b.posicaoObservada);
  const contagem = new Map<string, number>();
  const res = new Map<string, ColocacaoPorEscopo>();
  for (const it of ordenados) {
    const c = {} as ColocacaoPorEscopo;
    c.brasil = colocacao(it.posicaoObservada, porPagina);
    for (const escopo of ['uf', 'cidade'] as const) {
      const k = chaveEscopo(escopo, it.loterica);
      const n = (contagem.get(k) ?? 0) + 1;
      contagem.set(k, n);
      c[escopo] = colocacao(n, porPagina);
    }
    res.set(it.id, c);
  }
  return res;
}

/**
 * Colocação na ENTRADA (não a atual) de cada bolão, nos 3 escopos.
 * Para cada leitura (grupo de bolões com o mesmo first_seen_at), considera visíveis os bolões
 * que entraram até aquela leitura e ainda não tinham saído (esgotado/sumido).
 * Complexidade O(n · F), F = número de filas: aguenta a Mega da Virada (~100 mil bolões).
 */
export function posicoesNaEntrada(
  boloes: readonly BolaoNaVitrine[],
  porPagina = BOLOES_POR_PAGINA,
  regra: RegraOrdemVitrine = REGRA_ORDEM_PADRAO,
): Map<string, ColocacaoPorEscopo> {
  const ordenados = [...boloes].sort(compararChegada);
  const saidas = boloes
    .filter((b) => b.saiuEm && b.saiuEm.getTime() > b.firstSeenAt.getTime())
    .sort((a, b) => a.saiuEm!.getTime() - b.saiuEm!.getTime());

  // chave do escopo -> contagem de bolões visíveis por fila (índice = fila)
  const contadores = new Map<string, number[]>();
  const adicionar = (k: string, fila: number, delta: number) => {
    let arr = contadores.get(k);
    if (!arr) contadores.set(k, (arr = []));
    while (arr.length <= fila) arr.push(0);
    arr[fila] = arr[fila]! + delta;
  };
  const prefixoAntesDaFila = (k: string, fila: number): number => {
    const arr = contadores.get(k);
    if (!arr) return 0;
    let s = 0;
    for (let f = 0; f < fila && f < arr.length; f++) s += arr[f]!;
    return s;
  };
  const naFila = (k: string, fila: number): number => contadores.get(k)?.[fila] ?? 0;
  const chaves = (b: BolaoNaVitrine) =>
    (['brasil', 'uf', 'cidade'] as const).map((e) => [e, chaveEscopo(e, b.loterica)] as const);

  const res = new Map<string, ColocacaoPorEscopo>();
  let iSaida = 0;
  let i = 0;
  while (i < ordenados.length) {
    const t = ordenados[i]!.firstSeenAt.getTime();
    while (iSaida < saidas.length && saidas[iSaida]!.saiuEm!.getTime() <= t) {
      const s = saidas[iSaida++]!;
      for (const [, k] of chaves(s)) adicionar(k, s.fila, -1);
    }
    let j = i;
    while (j < ordenados.length && ordenados[j]!.firstSeenAt.getTime() === t) j++;
    const lote = ordenados.slice(i, j); // já em ordem da fonte dentro da leitura

    const noLote = new Map<string, number>(); // `${chave}|${fila}` -> quantos do lote
    for (const b of lote) {
      for (const [, k] of chaves(b)) {
        adicionar(k, b.fila, 1);
        const kk = `${k}|${b.fila}`;
        noLote.set(kk, (noLote.get(kk) ?? 0) + 1);
      }
    }
    const rank = new Map<string, number>();
    for (const b of lote) {
      const c = {} as ColocacaoPorEscopo;
      for (const [escopo, k] of chaves(b)) {
        const kk = `${k}|${b.fila}`;
        const r = (rank.get(kk) ?? 0) + 1;
        rank.set(kk, r);
        const antesDoLoteNaFila = naFila(k, b.fila) - (noLote.get(kk) ?? 0);
        // fila aleatória: na entrada, a posição esperada é o meio do bloco da fila naquele instante
        const dentro = regra === 'fila-aleatoria' ? posicaoEsperadaNoBloco(1, naFila(k, b.fila)) : antesDoLoteNaFila + r;
        c[escopo] = colocacao(prefixoAntesDaFila(k, b.fila) + dentro, porPagina);
      }
      res.set(b.id, c);
    }
    i = j;
  }
  return res;
}
