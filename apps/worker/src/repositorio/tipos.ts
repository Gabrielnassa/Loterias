import type { BolaoRegistrado, ConcursoAgendavel, ConcursoRef, LinhaMercado, ModalidadeSlug, ResultadoLeitura } from '@radar/core';

export interface ConcursoParaSalvar {
  modalidade: ModalidadeSlug;
  concurso: number;
  dataSorteio?: string;
  abreEm?: Date;
  fechaEm?: Date;
  premioEstimado?: number;
  acumulado?: boolean;
  especial?: boolean;
  /** fonte = visto na CAIXA; previsao = abertura prevista pelo calendário; manual = cadastrado. */
  origem: 'fonte' | 'previsao' | 'manual';
}

export interface InicioColeta {
  tipo: 'varredura' | 'contagens' | 'encerrar' | 'concursos';
  modo: 'normal' | 'abertura';
  modalidade?: ModalidadeSlug;
  concurso?: number;
  slot?: number;
  agendadaPara?: Date;
  iniciouEm: Date;
}

export interface FimColeta {
  terminouEm: Date;
  itens?: number;
  paginas?: number;
  completa?: boolean;
  novos?: number;
  eventos?: number;
  erro?: string;
}

/**
 * Persistência do coletor. Implementações: Postgres (produção) e memória (testes/dev).
 * Regra: abre_em já gravado nunca é sobrescrito por previsão/fonte (pode ter ajuste manual).
 */
export interface Repositorio {
  concursosAgendaveis(agora: Date): Promise<ConcursoAgendavel[]>;
  salvarConcursos(cs: readonly ConcursoParaSalvar[]): Promise<void>;
  carregarEstado(ref: ConcursoRef): Promise<BolaoRegistrado[]>;
  iniciarColeta(c: InicioColeta): Promise<number>;
  finalizarColeta(id: number, fim: FimColeta): Promise<void>;
  /** Grava novos bolões, alterações, last_seen_at, snapshots e eventos de uma leitura (atômico). */
  salvarLeitura(ref: ConcursoRef, r: ResultadoLeitura, coletaId: number, vistoEm: Date): Promise<void>;
  salvarMercado(ref: ConcursoRef, minuto: Date, linhas: readonly LinhaMercado[]): Promise<void>;
  marcarEncerrado(ref: ConcursoRef, em: Date): Promise<void>;
}
