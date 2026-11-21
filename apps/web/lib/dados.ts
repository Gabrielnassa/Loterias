import {
  buscarLotericas,
  type AberturaInfo,
  type ColocacaoPorEscopo,
  type LotericaRef,
  type ModalidadeSlug,
  type Participacao,
  type ParticipacaoInfo,
} from '@radar/core';
import { aberturaAoVivoSimulada, gerarHistoricoSimulado, type HistoricoSimulado } from '@radar/core/simulacao';

/**
 * Fonte de dados da web. Hoje: SIMULADA (histórico gerado pelas mesmas regras do coletor).
 * Quando o coletor real tiver histórico, uma implementação Postgres lê `aberturas` e
 * `abertura_participacoes` (gravadas pelo job de fim de janela) com o mesmo contrato.
 */
export interface AberturaDetalhada extends AberturaInfo {
  concurso: number;
  /** 'monitoradas' quando a coleta só via as lotéricas monitoradas (colocação indisponível). */
  escopoColocacao?: 'vitrine' | 'monitoradas';
}

export interface BolaoDaJanela {
  id: string;
  loterica: LotericaRef;
  firstSeenAt: Date;
  fila: number;
  jogos: number;
  dezenas: number;
  cotasTotal: number;
  cotasDisponiveis: number;
  valorCotaBase: number;
  sobraFinal: number | null;
  esgotouEm: Date | null;
  posEntrada: ColocacaoPorEscopo;
  empate: boolean;
}

export interface AoVivo {
  /** false = não há abertura em andamento; mostra o estado final da última. */
  emAndamento: boolean;
  t0: Date;
  modalidade: ModalidadeSlug;
  ultimaLeitura: Date | null;
  participacoes: Participacao[];
}

/** Lotérica do dono (multi-loja). `semDados`: configurada, mas o coletor ainda não viu bolões dela. */
export type MinhaLotericaRef = LotericaRef & { semDados?: boolean };

export interface FonteDadosRaioX {
  readonly tipo: 'simulada' | 'postgres';
  agora(): Date;
  /** Os dados exibidos são simulados (fonte simulada ou banco com o seed de demonstração). */
  simulado(): Promise<boolean>;
  lotericas(): Promise<LotericaRef[]>;
  loterica(codigo: string): Promise<LotericaRef | null>;
  buscar(termo: string, limite?: number): Promise<LotericaRef[]>;
  aberturas(): Promise<AberturaDetalhada[]>;
  participacoes(): Promise<ParticipacaoInfo[]>;
  abertura(id: string): Promise<AberturaDetalhada | null>;
  boloesDaAbertura(id: string): Promise<BolaoDaJanela[] | null>;
  aoVivo(agora: Date): Promise<AoVivo>;
  /** Lotéricas do dono (RADAR_MINHA_LOTERICA, várias separadas por vírgula; na demonstração, a simulada). */
  minhasLotericas(): Promise<MinhaLotericaRef[]>;
  /** A 1ª das lotéricas do dono (atalho para destaque em rankings e ao vivo). */
  minhaLoterica(): Promise<MinhaLotericaRef | null>;
}

export class FonteSimuladaRaioX implements FonteDadosRaioX {
  readonly tipo = 'simulada' as const;
  private h: HistoricoSimulado | null = null;
  private geradoEm = 0;
  private porCodigo = new Map<string, LotericaRef>();

  constructor(
    private readonly relogio: () => Date = () => new Date(),
    private readonly validadeMs = 60 * 60_000,
    private readonly opcoes: { semanas?: number; nLotericas?: number } = {},
  ) {}

  agora(): Date {
    return this.relogio();
  }

  async simulado() {
    return true;
  }

  /** Histórico simulado (também a base do Mercado simulado). */
  historico(): HistoricoSimulado {
    const agora = this.relogio();
    if (!this.h || agora.getTime() - this.geradoEm > this.validadeMs) {
      this.h = gerarHistoricoSimulado({ ate: agora, semanas: this.opcoes.semanas ?? 13, ...(this.opcoes.nLotericas ? { nLotericas: this.opcoes.nLotericas } : {}) });
      this.geradoEm = agora.getTime();
      this.porCodigo = new Map(this.h.lotericas.map((l) => [l.codigoCaixa, l]));
    }
    return this.h;
  }

  async lotericas() {
    return this.historico().lotericas;
  }
  async loterica(codigo: string) {
    this.historico();
    return this.porCodigo.get(codigo) ?? null;
  }
  async buscar(termo: string, limite = 20) {
    return buscarLotericas(this.historico().lotericas, termo, limite);
  }
  async aberturas() {
    return this.historico().aberturas.map(({ id, modalidade, t0, concurso }) => ({ id, modalidade, t0, concurso }));
  }
  async participacoes() {
    return this.historico().participacoes;
  }
  async abertura(id: string) {
    const a = this.historico().aberturas.find((x) => x.id === id);
    return a ? { id: a.id, modalidade: a.modalidade, t0: a.t0, concurso: a.concurso } : null;
  }
  async boloesDaAbertura(id: string) {
    const b = this.historico().detalhar(id);
    if (!b) return null;
    return b.map((x) => ({
      id: x.id,
      loterica: x.loterica,
      firstSeenAt: x.firstSeenAt,
      fila: x.fila,
      jogos: x.jogos,
      dezenas: x.dezenas,
      cotasTotal: x.cotasTotal,
      cotasDisponiveis: x.cotasDisponiveis,
      valorCotaBase: x.valorCotaBase,
      sobraFinal: x.sobraFinal ?? null,
      esgotouEm: x.esgotouEm,
      posEntrada: x.posEntrada,
      empate: x.empate ?? false,
    }));
  }
  async aoVivo(agora: Date): Promise<AoVivo> {
    return { emAndamento: true, ...aberturaAoVivoSimulada(this.historico(), agora) };
  }
  async minhasLotericas() {
    const demo = this.historico().lotericas[0];
    return demo ? [demo] : [];
  }
  async minhaLoterica() {
    return (await this.minhasLotericas())[0] ?? null;
  }
}

