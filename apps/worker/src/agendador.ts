import { CONFIG_COLETA_PADRAO, tarefasDevidas, type ConcursoAgendavel, type ConfigColeta, type Tarefa } from '@radar/core';
import type { Log } from './log';
import type { FonteDeTempo } from './relogio';
import type { Repositorio } from './repositorio/tipos';

export interface DepsAgendador {
  repo: Repositorio;
  relogio: FonteDeTempo;
  log: Log;
  /** Entrega a tarefa para execução (BullMQ ou fila em memória). */
  despachar: (t: Tarefa) => Promise<void> | void;
  /** true se ainda há uma tarefa da mesma chave em execução (evita leituras sobrepostas). */
  ocupado?: (t: Tarefa) => boolean;
  coleta?: ConfigColeta;
  tickMs?: number;
  recarregarConcursosMs?: number;
}

export interface EstatisticasAgendador {
  despachadas: number;
  puladasOcupado: number;
  /** Slots que passaram sem leitura (tick atrasado ou leitura anterior ainda rodando). */
  slotsPerdidos: number;
}

/**
 * Agendador ao segundo: a cada tick (250 ms) calcula as tarefas devidas pelo plano de coleta do
 * core e despacha as que avançaram de slot. Nunca acumula atraso: se um slot passou, pula para o
 * atual e conta como perdido (base do critério "< 1% de leituras perdidas").
 */
export class Agendador {
  private readonly ultimos = new Map<string, number>();
  private concursos: ConcursoAgendavel[] = [];
  private concursosCarregadosEm = Number.NEGATIVE_INFINITY;
  private timer: NodeJS.Timeout | null = null;
  private rodando = false;
  readonly estatisticas: EstatisticasAgendador = { despachadas: 0, puladasOcupado: 0, slotsPerdidos: 0 };

  constructor(private readonly d: DepsAgendador) {}

  /** Força recarregar os concursos no próximo tick (ex.: após sincronizar com a fonte). */
  invalidarConcursos(): void {
    this.concursosCarregadosEm = Number.NEGATIVE_INFINITY;
  }

  async tick(): Promise<Tarefa[]> {
    const agora = this.d.relogio.agora();
    if (agora.getTime() - this.concursosCarregadosEm >= (this.d.recarregarConcursosMs ?? 15_000)) {
      this.concursos = await this.d.repo.concursosAgendaveis(agora);
      this.concursosCarregadosEm = agora.getTime();
    }
    const devidas = tarefasDevidas(agora, this.concursos, this.ultimos, this.d.coleta ?? CONFIG_COLETA_PADRAO);
    const despachadas: Tarefa[] = [];
    for (const t of devidas) {
      if (this.d.ocupado?.(t)) {
        this.estatisticas.puladasOcupado++;
        this.estatisticas.slotsPerdidos++;
        this.ultimos.set(t.chave, t.slot);
        this.d.log.warn({ tarefa: t.chave, slot: t.slot }, 'leitura anterior ainda em andamento: slot pulado');
        continue;
      }
      const anterior = this.ultimos.get(t.chave);
      if (t.tipo === 'varredura' && anterior !== undefined && t.slot - anterior > 1) {
        this.estatisticas.slotsPerdidos += t.slot - anterior - 1;
        this.d.log.warn({ tarefa: t.chave, perdidos: t.slot - anterior - 1 }, 'slots perdidos');
      }
      this.ultimos.set(t.chave, t.slot);
      this.estatisticas.despachadas++;
      await this.d.despachar(t);
      despachadas.push(t);
      if (t.tipo !== 'varredura') this.invalidarConcursos();
    }
    return despachadas;
  }

  iniciar(): void {
    if (this.rodando) return;
    this.rodando = true;
    const tickMs = this.d.tickMs ?? 250;
    const agendar = () => {
      if (!this.rodando) return;
      // alinha ao próximo múltiplo de tickMs do relógio corrigido
      const atraso = tickMs - (this.d.relogio.agora().getTime() % tickMs);
      this.timer = setTimeout(async () => {
        try {
          await this.tick();
        } catch (e) {
          this.d.log.error({ erro: e instanceof Error ? e.message : String(e) }, 'falha no tick do agendador');
        }
        agendar();
      }, atraso);
    };
    agendar();
  }

  parar(): void {
    this.rodando = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
