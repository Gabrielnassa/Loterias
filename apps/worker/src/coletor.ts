import {
  agregarMercado,
  aplicarLeitura,
  BloqueadoPelaFonteError,
  chaveConcurso,
  encerrarConcurso,
  minutoDe,
  MonitorSaudeFonte,
  novoEstadoConcurso,
  preverProximaAbertura,
  varrerConcurso,
  type Alerta,
  type ConcursoRef,
  type EstadoConcurso,
  type FonteBoloes,
  type Tarefa,
} from '@radar/core';
import { CONFIG_COLETOR_PADRAO, type ConfigColetor } from './config';
import type { Log } from './log';
import type { FonteDeTempo } from './relogio';
import type { ConcursoParaSalvar, Repositorio } from './repositorio/tipos';

export interface ResumoTarefa {
  ok: boolean;
  pulada?: 'pausado';
  itens?: number;
  novos?: number;
  eventos?: number;
  erro?: string;
}

export interface DepsColetor {
  fonte: FonteBoloes;
  repo: Repositorio;
  relogio: FonteDeTempo;
  log: Log;
  config?: ConfigColetor;
  /** Chamado em falhas seguidas, mudança de formato ou bloqueio (push/e-mail ficam para a Fase 6). */
  alertar?: (alerta: Alerta & { tarefa: string }) => void;
}

/**
 * Executa as tarefas do plano de coleta. Mantém em memória o estado de cada concurso coletado
 * (carregado do banco na 1ª vez), aplica as regras do core e persiste o resultado.
 * Se a persistência falhar, o estado em memória é descartado e recarregado na próxima leitura.
 */
export class Coletor {
  private readonly estados = new Map<string, EstadoConcurso>();
  private readonly ultimoKeyframe = new Map<string, number>();
  private readonly saude = new MonitorSaudeFonte(3);
  private readonly cfg: ConfigColetor;
  pausadoAte = 0;

  constructor(private readonly d: DepsColetor) {
    this.cfg = d.config ?? CONFIG_COLETOR_PADRAO;
  }

  async executar(t: Tarefa): Promise<ResumoTarefa> {
    if (this.d.relogio.agora().getTime() < this.pausadoAte) {
      this.d.log.warn({ tarefa: t.chave }, 'coleta pausada após bloqueio da fonte');
      return { ok: false, pulada: 'pausado' };
    }
    switch (t.tipo) {
      case 'varredura':
        return this.varredura(t);
      case 'contagens':
        return this.contagens(t);
      case 'encerrar':
        return this.encerrar(t);
    }
  }

  private async estado(ref: ConcursoRef): Promise<EstadoConcurso> {
    const k = chaveConcurso(ref);
    let e = this.estados.get(k);
    if (!e) {
      e = novoEstadoConcurso(ref, await this.d.repo.carregarEstado(ref));
      this.estados.set(k, e);
    }
    return e;
  }

  private falha(t: Tarefa, erro: unknown): string {
    const msg = erro instanceof Error ? erro.message : String(erro);
    const alerta = this.saude.registrarFalha(erro);
    this.d.log.error({ tarefa: t.chave, erro: msg, falhasSeguidas: this.saude.falhasSeguidas }, 'falha na coleta');
    if (alerta) {
      this.d.log.error({ tarefa: t.chave, alerta }, 'ALERTA da fonte');
      this.d.alertar?.({ ...alerta, tarefa: t.chave });
    }
    if (erro instanceof BloqueadoPelaFonteError) {
      // não burlar: para tudo por um tempo e espera um humano olhar
      this.pausadoAte = this.d.relogio.agora().getTime() + this.cfg.pausaBloqueioMs;
    }
    return msg;
  }

  private async varredura(t: Extract<Tarefa, { tipo: 'varredura' }>): Promise<ResumoTarefa> {
    const { repo, relogio } = this.d;
    const ref = t.concurso;
    const k = chaveConcurso(ref);
    const coletaId = await repo.iniciarColeta({
      tipo: 'varredura',
      modo: t.modo,
      modalidade: ref.modalidade,
      concurso: ref.concurso,
      slot: t.slot,
      agendadaPara: t.agendadaPara,
      iniciouEm: relogio.agora(),
    });
    try {
      const estado = await this.estado(ref);
      const leitura = await varrerConcurso(this.d.fonte, ref, {
        maxPaginas: this.cfg.maxPaginas[t.modo],
        agora: () => relogio.agora(),
      });
      const agora = relogio.agora().getTime();
      const keyframe = agora - (this.ultimoKeyframe.get(k) ?? 0) >= this.cfg.keyframeMs;
      const r = aplicarLeitura(estado, leitura, { keyframe, leiturasParaSumico: this.cfg.leiturasParaSumico });
      try {
        await repo.salvarLeitura(ref, r, coletaId, leitura.terminouEm);
        if (leitura.completa) await repo.salvarMercado(ref, minutoDe(leitura.iniciouEm), agregarMercado(leitura.itens));
      } catch (e) {
        this.estados.delete(k); // memória divergiu do banco: recarrega na próxima
        throw e;
      }
      if (keyframe) this.ultimoKeyframe.set(k, agora);
      if (leitura.erro) this.falha(t, leitura.erro);
      else this.saude.registrarSucesso();
      await repo.finalizarColeta(coletaId, {
        terminouEm: relogio.agora(),
        itens: leitura.itens.length,
        paginas: leitura.paginasLidas,
        completa: leitura.completa,
        novos: r.novos.length,
        eventos: r.eventos.length,
        ...(leitura.erro ? { erro: `leitura parcial: ${leitura.erro.message}` } : {}),
      });
      if (r.novos.length) this.d.log.debug({ tarefa: t.chave, novos: r.novos.length }, 'bolões novos');
      return { ok: true, itens: leitura.itens.length, novos: r.novos.length, eventos: r.eventos.length };
    } catch (e) {
      const erro = this.falha(t, e);
      await repo.finalizarColeta(coletaId, { terminouEm: relogio.agora(), erro }).catch(() => {});
      return { ok: false, erro };
    }
  }

  /** Contagens (60 s) + sincronização dos concursos abertos e previsão da próxima abertura. */
  private async contagens(t: Extract<Tarefa, { tipo: 'contagens' }>): Promise<ResumoTarefa> {
    const { repo, relogio, fonte } = this.d;
    const coletaId = await repo.iniciarColeta({ tipo: 'contagens', modo: 'normal', slot: t.slot, agendadaPara: t.agendadaPara, iniciouEm: relogio.agora() });
    try {
      const [abertos, contagens] = await Promise.all([fonte.concursosAbertos(), fonte.contagens()]);
      const salvar: ConcursoParaSalvar[] = [];
      for (const c of abertos) {
        salvar.push({
          modalidade: c.modalidade,
          concurso: c.concurso,
          origem: 'fonte',
          ...(c.dataSorteio ? { dataSorteio: c.dataSorteio } : {}),
          ...(c.fechaEm ? { fechaEm: c.fechaEm } : {}),
          ...(c.premioEstimado !== undefined ? { premioEstimado: c.premioEstimado } : {}),
          ...(c.acumulado !== undefined ? { acumulado: c.acumulado } : {}),
          ...(c.especial !== undefined ? { especial: c.especial } : {}),
        });
        if (c.dataSorteio && !c.especial) {
          const prox = preverProximaAbertura({ modalidade: c.modalidade, concurso: c.concurso, dataSorteio: c.dataSorteio });
          salvar.push({ modalidade: prox.modalidade, concurso: prox.concurso, abreEm: prox.abreEm, origem: 'previsao' });
        }
      }
      await repo.salvarConcursos(salvar);
      const minuto = minutoDe(relogio.agora());
      for (const c of contagens) {
        await repo.salvarMercado(c, minuto, [
          { uf: 'BR', boloes: c.boloes, cotasDisponiveis: c.cotasDisponiveis ?? 0, lotericas: c.lotericas ?? 0, valorAVenda: c.valorAVenda ?? 0 },
        ]);
      }
      this.saude.registrarSucesso();
      await repo.finalizarColeta(coletaId, { terminouEm: relogio.agora(), itens: contagens.length, completa: true });
      return { ok: true, itens: contagens.length };
    } catch (e) {
      const erro = this.falha(t, e);
      await repo.finalizarColeta(coletaId, { terminouEm: relogio.agora(), erro }).catch(() => {});
      return { ok: false, erro };
    }
  }

  /** Fechamento do concurso: sobra = disponíveis no último snapshot. */
  private async encerrar(t: Extract<Tarefa, { tipo: 'encerrar' }>): Promise<ResumoTarefa> {
    const { repo, relogio } = this.d;
    const ref = t.concurso;
    const coletaId = await repo.iniciarColeta({
      tipo: 'encerrar',
      modo: 'normal',
      modalidade: ref.modalidade,
      concurso: ref.concurso,
      iniciouEm: relogio.agora(),
    });
    try {
      const estado = await this.estado(ref);
      const em = t.agendadaPara;
      const r = encerrarConcurso(estado, em);
      await repo.salvarLeitura(ref, r, coletaId, estado.ultimaLeituraEm ?? em);
      await repo.marcarEncerrado(ref, em);
      this.estados.delete(chaveConcurso(ref));
      await repo.finalizarColeta(coletaId, { terminouEm: relogio.agora(), eventos: r.eventos.length, completa: true });
      this.d.log.info({ concurso: chaveConcurso(ref), boloes: r.eventos.length }, 'concurso encerrado');
      return { ok: true, eventos: r.eventos.length };
    } catch (e) {
      this.estados.delete(chaveConcurso(ref));
      const erro = e instanceof Error ? e.message : String(e);
      this.d.log.error({ tarefa: t.chave, erro }, 'falha ao encerrar concurso');
      await repo.finalizarColeta(coletaId, { terminouEm: relogio.agora(), erro }).catch(() => {});
      return { ok: false, erro };
    }
  }
}
