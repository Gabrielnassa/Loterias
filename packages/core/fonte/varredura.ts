import type { ConcursoRef } from '../dominio/tipos';
import { validarPagina } from './contrato';
import type { BolaoFonte, FonteBoloes } from './tipos';

/** Bolão visto numa leitura, com a posição observada e o instante em que a página foi obtida. */
export interface ItemLeitura extends BolaoFonte {
  /** 1-based, na ordem devolvida pela fonte (após remover duplicados). */
  posicaoObservada: number;
  /** Instante em que a página que continha o item foi obtida. */
  vistoEm: Date;
}

/** Resultado de uma varredura (uma "leitura") da vitrine de um concurso. */
export interface LeituraVitrine extends ConcursoRef {
  iniciouEm: Date;
  terminouEm: Date;
  paginasLidas: number;
  totalPaginasFonte?: number;
  /** true se chegou à última página. Só leituras completas permitem inferir "sumiu". */
  completa: boolean;
  /** true se todas as páginas declararam estar na ordem da vitrine. */
  ordemDaVitrine: boolean;
  /** Itens vistos em mais de uma página (a vitrine andou durante a leitura). */
  duplicados: number;
  itens: ItemLeitura[];
  /** Erro que interrompeu a leitura depois da 1ª página (leitura parcial). */
  erro?: Error;
}

export interface OpcoesVarredura {
  /** Limite de páginas por leitura (proteção da fonte e do tempo de leitura). */
  maxPaginas?: number;
  sinal?: AbortSignal;
  agora?: () => Date;
}

/**
 * Lê a vitrine de um concurso da página 1 em diante até acabar (ou bater `maxPaginas`).
 * Como a leitura é sempre um PREFIXO contíguo da vitrine, as posições observadas por UF e
 * cidade calculadas a partir dela são válidas mesmo numa leitura parcial.
 * Erro na 1ª página é propagado; erro depois vira leitura parcial com `erro` preenchido.
 */
export async function varrerConcurso(
  fonte: FonteBoloes,
  alvo: ConcursoRef,
  opcoes: OpcoesVarredura = {},
): Promise<LeituraVitrine> {
  const agora = opcoes.agora ?? (() => new Date());
  const maxPaginas = opcoes.maxPaginas ?? 500;
  const iniciouEm = agora();
  const itens: ItemLeitura[] = [];
  const vistos = new Set<string>();
  let duplicados = 0;
  let paginasLidas = 0;
  let completa = false;
  let ordemDaVitrine = true;
  let totalPaginasFonte: number | undefined;
  let erro: Error | undefined;

  for (let p = 1; p <= maxPaginas; p++) {
    let pagina;
    try {
      pagina = validarPagina(
        await fonte.pagina({ modalidade: alvo.modalidade, concurso: alvo.concurso, pagina: p }, opcoes.sinal),
      );
    } catch (e) {
      if (p === 1) throw e;
      erro = e instanceof Error ? e : new Error(String(e));
      break;
    }
    paginasLidas++;
    ordemDaVitrine &&= pagina.ordemDaVitrine;
    if (pagina.totalPaginas !== undefined) totalPaginasFonte = pagina.totalPaginas;
    for (const b of pagina.itens) {
      if (vistos.has(b.idCaixa)) {
        duplicados++;
        continue;
      }
      vistos.add(b.idCaixa);
      itens.push({ ...b, posicaoObservada: itens.length + 1, vistoEm: pagina.obtidaEm });
    }
    const ultima =
      pagina.itens.length < pagina.tamanhoPagina ||
      (pagina.totalPaginas !== undefined && p >= pagina.totalPaginas);
    if (ultima) {
      completa = true;
      break;
    }
  }

  return {
    modalidade: alvo.modalidade,
    concurso: alvo.concurso,
    iniciouEm,
    terminouEm: agora(),
    paginasLidas,
    totalPaginasFonte,
    completa,
    ordemDaVitrine,
    duplicados,
    itens,
    ...(erro ? { erro } : {}),
  };
}
