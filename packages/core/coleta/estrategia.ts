import { BOLOES_POR_PAGINA } from '../dominio/constantes';
import type { EstadoConcurso } from '../eventos/estado';

/**
 * Estratégia de leitura no modo abertura (resposta do dono do produto, 21/11/2026):
 *  - no começo o concurso novo tem poucas páginas: leitura COMPLETA;
 *  - quando a leitura completa passa do intervalo (5 s), ler só as páginas onde termina a 1ª fila,
 *    porque é lá que entram os bolões novos que importam (o 1º bolão de cada lotérica vai para o fim
 *    da 1ª fila); uma leitura completa periódica pega os 2º, 3º... bolões e as vendas.
 */
export type PlanoLeitura = { tipo: 'completa' } | { tipo: 'borda'; paginas: number[] };

export interface EntradaEstrategia {
  agora: number;
  intervaloMs: number;
  /** Duração e instante da última leitura completa (null = ainda não houve). */
  duracaoUltimaCompletaMs: number | null;
  ultimaCompletaEm: number | null;
  /** Bolões da 1ª fila visíveis no concurso (onde a 1ª fila termina). */
  boloesFila1: number;
  totalVisiveis: number;
  porPagina?: number;
  /** Páginas a mais depois da borda (bolões novos empurram a borda). Default 1. */
  margemPaginas?: number;
  /** Força uma leitura completa a cada X ms mesmo no modo borda. Default 60 s. */
  completaACadaMs?: number;
}

export function planejarLeitura(e: EntradaEstrategia): PlanoLeitura {
  const porPagina = e.porPagina ?? BOLOES_POR_PAGINA;
  if (e.duracaoUltimaCompletaMs === null || e.ultimaCompletaEm === null) return { tipo: 'completa' };
  if (e.duracaoUltimaCompletaMs <= e.intervaloMs) return { tipo: 'completa' };
  if (e.agora - e.ultimaCompletaEm >= (e.completaACadaMs ?? 60_000)) return { tipo: 'completa' };
  const ultimaPaginaExistente = Math.max(1, Math.ceil((e.totalVisiveis + 1) / porPagina));
  const inicio = Math.max(1, Math.ceil(Math.max(1, e.boloesFila1) / porPagina));
  const fim = Math.min(ultimaPaginaExistente + (e.margemPaginas ?? 1), Math.ceil((e.boloesFila1 + 1) / porPagina) + (e.margemPaginas ?? 1));
  const paginas: number[] = [];
  for (let p = inicio; p <= Math.max(inicio, fim); p++) paginas.push(p);
  return { tipo: 'borda', paginas };
}

/** Bolões da 1ª fila ainda visíveis (à venda) e total visível, a partir do estado do coletor. */
export function resumoFilas(estado: EstadoConcurso): { boloesFila1: number; totalVisiveis: number } {
  let f1 = 0;
  let total = 0;
  for (const b of estado.boloes.values()) {
    if (b.status !== 'a_venda') continue;
    total++;
    if (b.fila === 1) f1++;
  }
  return { boloesFila1: f1, totalVisiveis: total };
}
