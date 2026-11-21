import type { JogoBolao } from '../dominio/jogo';
import type { ModalidadeSlug } from '../dominio/modalidades';
import type { LotericaRef } from '../dominio/tipos';

/**
 * Contrato do ADAPTADOR DA FONTE (Marketplace de Bolões da CAIXA).
 *
 * Tudo o que o resto do sistema sabe sobre a fonte passa por aqui, já NORMALIZADO.
 * O formato bruto da CAIXA ainda é desconhecido (Fase 0, ver docs/fonte-caixa.md); quando for
 * mapeado, só o adaptador concreto (adaptadores/caixa-http.ts) muda.
 */

/** Bolão como devolvido pela fonte, já normalizado. */
export interface BolaoFonte {
  /** Identificador estável do bolão na CAIXA. */
  idCaixa: string;
  loterica: LotericaRef;
  modalidade: ModalidadeSlug;
  concurso: number;
  jogos: number;
  dezenas: number;
  cotasTotal: number;
  cotasDisponiveis: number;
  /** Valor base da cota, SEM tarifa (= valor da aposta por cota). */
  valorCotaBase: number;
  /** Valor exibido ao apostador (com tarifa), se a fonte informar. */
  valorCotaExibido?: number;
  /** Números de cada jogo, se a fonte informar (pode exigir chamada de detalhe). */
  numeros?: number[][];
  /** Jogos com as marcações além dos números (trevos, Time do Coração, Mês da Sorte, colunas do
   * Super Sete, palpites da Loteca), se a fonte informar. Quando vem, vale no lugar de `numeros`. */
  jogosDetalhe?: JogoBolao[];
  /** Horário de inserção informado pela própria fonte, se existir (dispensaria a inferência). */
  inseridoEmFonte?: Date;
  /** Fila informada pela fonte (campo `index` da CAIXA), quando vier. */
  filaFonte?: number;
  /** Cotas oferecidas na internet (qtdCotaDigital); o restante do total fica no balcão. */
  cotasDigitais?: number;
  /** Bolão com resíduo: a última cota tem valor diferente. */
  contemResiduo?: boolean;
  valorUltimaCotaBase?: number;
  /** Tarifa por cota informada pela fonte (valorTarifaServico). */
  tarifaPorCotaFonte?: number;
  /** Trevos (+Milionária). */
  trevos?: number;
}

export interface ConsultaBoloes {
  modalidade: ModalidadeSlug;
  concurso: number;
  /** 1-based. */
  pagina: number;
  uf?: string;
  cidade?: string;
  codigoLoterica?: string;
}

export interface PaginaBoloes {
  consulta: ConsultaBoloes;
  pagina: number;
  tamanhoPagina: number;
  totalPaginas?: number;
  totalItens?: number;
  itens: BolaoFonte[];
  /** true se a fonte devolve os itens na mesma ordem da vitrine (fila, chegada). */
  ordemDaVitrine: boolean;
  /** Instante da resposta (relógio do coletor). */
  obtidaEm: Date;
  /** Hora informada pelo servidor da fonte (dataHoraServidor), para medir o desvio de relógio. */
  horaServidor?: Date;
}

export interface ConcursoAbertoFonte {
  modalidade: ModalidadeSlug;
  concurso: number;
  /** Data do sorteio (YYYY-MM-DD), se informada. */
  dataSorteio?: string;
  /** Instante do sorteio (dia + hora), se informado. Base da previsão do T0 do concurso seguinte. */
  sorteioEm?: Date;
  fechaEm?: Date;
  premioEstimado?: number;
  acumulado?: boolean;
  especial?: boolean;
}

export interface ContagemFonte {
  modalidade: ModalidadeSlug;
  concurso: number;
  boloes: number;
  cotasDisponiveis?: number;
  lotericas?: number;
  valorAVenda?: number;
}

export interface FonteBoloes {
  readonly nome: string;
  /**
   * 'vitrine' (padrão): a leitura cobre a vitrine, então a colocação calculada vale.
   * 'monitoradas': só bolões de lotéricas escolhidas (links públicos); a colocação NÃO é a da vitrine.
   */
  readonly escopoColocacao?: 'vitrine' | 'monitoradas';
  /** Concursos com bolões à venda agora. */
  concursosAbertos(sinal?: AbortSignal): Promise<ConcursoAbertoFonte[]>;
  /** Contagens agregadas por modalidade/concurso (modo normal, a cada 60 s). */
  contagens(sinal?: AbortSignal): Promise<ContagemFonte[]>;
  /** Uma página da lista de bolões. */
  pagina(consulta: ConsultaBoloes, sinal?: AbortSignal): Promise<PaginaBoloes>;
  /** Libera recursos (ex.: navegador). */
  fechar?(): Promise<void>;
}
