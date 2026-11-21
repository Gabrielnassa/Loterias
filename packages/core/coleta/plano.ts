import { MODALIDADES, type ModalidadeSlug } from '../dominio/modalidades';
import { chaveConcurso, type ConcursoRef } from '../dominio/tipos';
import { noDiaSP, t0Padrao } from '../tempo/fuso';

/**
 * Plano de coleta (SPEC, Motor de dados — dois modos):
 *  Normal   o dia todo: contagens a cada 60 s; varredura completa a cada 5-10 min por concurso.
 *  Abertura de T0 − 1 min até T0 + 60 min: 5 s nos primeiros 15 min, depois 15 s; só o concurso
 *           recém-aberto. Os demais concursos seguem no modo normal.
 * Leituras são alinhadas em "slots" a partir de T0 − 1 min (T0 cai exatamente num slot), o que
 * torna a hora de cada leitura previsível e o erro máximo igual ao intervalo.
 */
export interface ConfigColeta {
  contagensMs: number;
  varreduraNormalMs: number;
  aberturaAntesMs: number;
  aberturaDuracaoMs: number;
  aberturaRapidaMs: number;
  intervaloRapidoMs: number;
  intervaloLentoMs: number;
}

export const CONFIG_COLETA_PADRAO: ConfigColeta = {
  contagensMs: 60_000,
  varreduraNormalMs: 5 * 60_000,
  aberturaAntesMs: 60_000,
  aberturaDuracaoMs: 60 * 60_000,
  aberturaRapidaMs: 15 * 60_000,
  intervaloRapidoMs: 5_000,
  intervaloLentoMs: 15_000,
};

export interface ConcursoAgendavel extends ConcursoRef {
  abreEm?: Date | null;
  fechaEm?: Date | null;
  encerrado?: boolean;
  /** A janela da abertura já foi processada (participações gravadas). */
  aberturaProcessada?: boolean;
}

export type ModoConcurso =
  | { modo: 'abertura'; intervaloMs: number; slot: number; slotEm: Date }
  | { modo: 'normal'; intervaloMs: number; slot: number; slotEm: Date }
  | { modo: 'aguardando'; abreEm: Date }
  | { modo: 'fechado' };

export function modoDoConcurso(agora: Date, c: ConcursoAgendavel, cfg: ConfigColeta = CONFIG_COLETA_PADRAO): ModoConcurso {
  const t = agora.getTime();
  if (c.encerrado || (c.fechaEm && t >= c.fechaEm.getTime())) return { modo: 'fechado' };
  if (c.abreEm) {
    const t0 = c.abreEm.getTime();
    const inicio = t0 - cfg.aberturaAntesMs;
    const fimRapido = t0 + cfg.aberturaRapidaMs;
    const fim = t0 + cfg.aberturaDuracaoMs;
    if (t < inicio) return { modo: 'aguardando', abreEm: c.abreEm };
    if (t < fimRapido) {
      const slot = Math.floor((t - inicio) / cfg.intervaloRapidoMs);
      return { modo: 'abertura', intervaloMs: cfg.intervaloRapidoMs, slot, slotEm: new Date(inicio + slot * cfg.intervaloRapidoMs) };
    }
    if (t < fim) {
      const slotsRapidos = Math.ceil((fimRapido - inicio) / cfg.intervaloRapidoMs);
      const k = Math.floor((t - fimRapido) / cfg.intervaloLentoMs);
      return {
        modo: 'abertura',
        intervaloMs: cfg.intervaloLentoMs,
        slot: slotsRapidos + k,
        slotEm: new Date(fimRapido + k * cfg.intervaloLentoMs),
      };
    }
  }
  const slot = Math.floor(t / cfg.varreduraNormalMs);
  return { modo: 'normal', intervaloMs: cfg.varreduraNormalMs, slot, slotEm: new Date(slot * cfg.varreduraNormalMs) };
}

export type Tarefa =
  | { tipo: 'contagens'; chave: string; slot: number; agendadaPara: Date; prioridade: number }
  | {
      tipo: 'varredura';
      chave: string;
      concurso: ConcursoRef;
      modo: 'abertura' | 'normal';
      slot: number;
      agendadaPara: Date;
      prioridade: number;
    }
  | { tipo: 'encerrar'; chave: string; concurso: ConcursoRef; slot: number; agendadaPara: Date; prioridade: number; t0?: Date }
  /** Fim da janela da abertura: calcula e grava as participações (base do Raio-X). */
  | { tipo: 'abertura'; chave: string; concurso: ConcursoRef; t0: Date; slot: number; agendadaPara: Date; prioridade: number };

/** Prioridades (menor = mais urgente), no padrão do BullMQ. */
export const PRIORIDADE = { abertura: 1, encerrar: 2, fecharAbertura: 2, contagens: 3, normal: 5 } as const;

/**
 * Tarefas devidas agora. `ultimos` guarda, por chave de tarefa, o último slot já disparado —
 * uma tarefa só sai quando o slot avança (idempotente: chamar várias vezes no mesmo slot não duplica).
 */
export function tarefasDevidas(
  agora: Date,
  concursos: readonly ConcursoAgendavel[],
  ultimos: ReadonlyMap<string, number>,
  cfg: ConfigColeta = CONFIG_COLETA_PADRAO,
): Tarefa[] {
  const tarefas: Tarefa[] = [];
  const devido = (chave: string, slot: number) => (ultimos.get(chave) ?? -1) < slot;

  const slotContagem = Math.floor(agora.getTime() / cfg.contagensMs);
  if (devido('contagens', slotContagem)) {
    tarefas.push({
      tipo: 'contagens',
      chave: 'contagens',
      slot: slotContagem,
      agendadaPara: new Date(slotContagem * cfg.contagensMs),
      prioridade: PRIORIDADE.contagens,
    });
  }

  for (const c of concursos) {
    const ref = { modalidade: c.modalidade, concurso: c.concurso };
    if (c.abreEm && !c.aberturaProcessada && !c.encerrado) {
      const fimJanela = c.abreEm.getTime() + cfg.aberturaDuracaoMs;
      const chave = `fechar-abertura:${chaveConcurso(ref)}`;
      if (agora.getTime() >= fimJanela && devido(chave, 0)) {
        tarefas.push({
          tipo: 'abertura', chave, concurso: ref, t0: c.abreEm, slot: 0, agendadaPara: new Date(fimJanela), prioridade: PRIORIDADE.fecharAbertura,
        });
      }
    }
    const m = modoDoConcurso(agora, c, cfg);
    if (m.modo === 'fechado') {
      const chave = `encerrar:${chaveConcurso(ref)}`;
      if (!c.encerrado && c.fechaEm && devido(chave, 0)) {
        tarefas.push({
          tipo: 'encerrar', chave, concurso: ref, slot: 0, agendadaPara: c.fechaEm, prioridade: PRIORIDADE.encerrar,
          ...(c.abreEm ? { t0: c.abreEm } : {}),
        });
      }
      continue;
    }
    if (m.modo === 'aguardando') continue;
    const chave = `${m.modo}:${chaveConcurso(ref)}`;
    if (devido(chave, m.slot)) {
      tarefas.push({
        tipo: 'varredura',
        chave,
        concurso: ref,
        modo: m.modo,
        slot: m.slot,
        agendadaPara: m.slotEm,
        prioridade: m.modo === 'abertura' ? PRIORIDADE.abertura : PRIORIDADE.normal,
      });
    }
  }
  return tarefas.sort((a, b) => a.prioridade - b.prioridade);
}

/**
 * Previsão da próxima abertura de uma modalidade: o concurso seguinte abre no T0 padrão do dia
 * do sorteio do concurso atual (21:45 seg-sáb, 11:45 dom). É só um default: concursos.abre_em
 * pode ser ajustado manualmente por concurso.
 */
export function preverProximaAbertura(atual: { modalidade: ModalidadeSlug; concurso: number; dataSorteio: string }): {
  modalidade: ModalidadeSlug;
  concurso: number;
  abreEm: Date;
} {
  return { modalidade: atual.modalidade, concurso: atual.concurso + 1, abreEm: t0Padrao(atual.dataSorteio) };
}

/** Fechamento padrão das vendas no dia do sorteio (referência por modalidade; confirmar na Fase 0). */
export function fechamentoPadrao(modalidade: ModalidadeSlug, dataSorteio: string): Date {
  const h = MODALIDADES[modalidade].horarioFechamento;
  return noDiaSP(dataSorteio, h.hora, h.minuto);
}
