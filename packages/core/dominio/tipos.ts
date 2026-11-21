import type { ModalidadeSlug } from './modalidades';

/** Escopos de colocação na vitrine. */
export type Escopo = 'cidade' | 'uf' | 'brasil';
export const ESCOPOS: readonly Escopo[] = ['cidade', 'uf', 'brasil'];

/** Identificação mínima de uma lotérica, como vista no Marketplace. */
export interface LotericaRef {
  codigoCaixa: string;
  nome: string;
  cidade: string;
  uf: string;
  bairro?: string;
}

/** Posição (1-based) e página em cada escopo. */
export interface Colocacao {
  posicao: number;
  pagina: number;
}
export type ColocacaoPorEscopo = Record<Escopo, Colocacao>;

/** Identifica um concurso. */
export interface ConcursoRef {
  modalidade: ModalidadeSlug;
  concurso: number;
}

export function chaveConcurso(c: ConcursoRef): string {
  return `${c.modalidade}#${c.concurso}`;
}
