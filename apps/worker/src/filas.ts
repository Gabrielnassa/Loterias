import { chaveConcurso, type Tarefa } from '@radar/core';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Coletor } from './coletor';
import type { Log } from './log';

export interface Fila {
  despachar(t: Tarefa): Promise<void>;
  ocupado(t: Tarefa): boolean;
  fechar(): Promise<void>;
}

/** Chave de exclusão: no máximo uma leitura por concurso ao mesmo tempo. */
function chaveExclusiva(t: Tarefa): string {
  return t.tipo === 'contagens' ? 'contagens' : chaveConcurso(t.concurso);
}

/** Tarefas viajam como JSON: Date vira string e precisa voltar. */
function reviver(t: Tarefa): Tarefa {
  return { ...t, agendadaPara: new Date(t.agendadaPara) };
}

class ControleOcupacao {
  private readonly ativos = new Map<string, number>();
  constructor(private readonly ttlMs = 120_000) {}
  marcar(t: Tarefa) {
    this.ativos.set(chaveExclusiva(t), Date.now());
  }
  liberar(t: Tarefa) {
    this.ativos.delete(chaveExclusiva(t));
  }
  ocupado(t: Tarefa) {
    const desde = this.ativos.get(chaveExclusiva(t));
    return desde !== undefined && Date.now() - desde < this.ttlMs;
  }
}

/** Fila em memória (dev/testes): executa direto, sem Redis, com limite de concorrência. */
export function criarFilaMemoria(coletor: Coletor, log: Log, concorrencia = 4): Fila & { ociosa(): Promise<void> } {
  const ctl = new ControleOcupacao();
  const emVoo = new Set<Promise<unknown>>();
  const espera: (() => void)[] = [];
  const rodar = async (t: Tarefa) => {
    try {
      await coletor.executar(t);
    } catch (e) {
      log.error({ tarefa: t.chave, erro: e instanceof Error ? e.message : String(e) }, 'tarefa falhou');
    } finally {
      ctl.liberar(t);
      espera.shift()?.();
    }
  };
  return {
    async despachar(t) {
      ctl.marcar(t);
      while (emVoo.size >= concorrencia) await new Promise<void>((r) => espera.push(r));
      const p = rodar(t).finally(() => emVoo.delete(p));
      emVoo.add(p);
    },
    ocupado: (t) => ctl.ocupado(t),
    async ociosa() {
      while (emVoo.size) await Promise.all([...emVoo]);
    },
    async fechar() {
      await Promise.all([...emVoo]);
    },
  };
}

/**
 * Fila BullMQ/Redis. jobId = chave + slot, então o mesmo slot nunca roda duas vezes (mesmo com
 * dois agendadores). Prioridade: abertura (1) > encerrar > contagens > normal.
 */
export function criarFilaBullmq(conexao: ConnectionOptions, coletor: Coletor, log: Log, concorrencia = 4): Fila {
  const ctl = new ControleOcupacao();
  const fila = new Queue<Tarefa>('coleta', { connection: conexao });
  const worker = new Worker<Tarefa>(
    'coleta',
    async (job) => {
      const t = reviver(job.data);
      try {
        return await coletor.executar(t);
      } finally {
        ctl.liberar(t);
      }
    },
    { connection: conexao, concurrency: concorrencia },
  );
  worker.on('failed', (job, e) => log.error({ job: job?.id, erro: e.message }, 'job de coleta falhou'));
  worker.on('error', (e) => log.error({ erro: e.message }, 'erro no worker BullMQ'));
  return {
    async despachar(t) {
      ctl.marcar(t);
      const jobId = `${t.chave}@${t.slot}`.replace(/[:#]/g, '_');
      await fila.add(t.tipo, t, {
        jobId,
        priority: t.prioridade,
        attempts: 1, // repetir uma leitura atrasada não tem valor: o próximo slot já vem
        removeOnComplete: { count: 2000 },
        removeOnFail: { count: 5000 },
      });
    },
    ocupado: (t) => ctl.ocupado(t),
    async fechar() {
      await worker.close();
      await fila.close();
    },
  };
}
