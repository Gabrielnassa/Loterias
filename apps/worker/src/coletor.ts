import {
  agregarMercado,
  ajustarT0,
  aplicarLeitura,
  BloqueadoPelaFonteError,
  ConfirmacaoHumanaNecessariaError,
  lerPaginas,
  planejarLeitura,
  preverAbertura,
  REGRAS_ABERTURA_PADRAO,
  resumoFilas,
  bolaoDaAbertura,
  calcularParticipacoes,
  chaveConcurso,
  encerrarConcurso,
  minutoDe,
  MonitorSaudeFonte,
  novoEstadoConcurso,
  varrerConcurso,
  type RegraAbertura,
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
  private regras: { em: number; regras: readonly RegraAbertura[] } | null = null;
  /** Última leitura completa por concurso (base da estratégia de leitura na abertura). */
  private readonly ultimaCompleta = new Map<string, { em: number; duracaoMs: number }>();

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
      case 'abertura':
        return this.fecharAbertura(t);
    }
  }

  /** Regras de abertura (tabela editável no banco), com cache de 10 min. */
  private async regrasAbertura(): Promise<readonly RegraAbertura[]> {
    const agora = this.d.relogio.agora().getTime();
    if (!this.regras || agora - this.regras.em > 10 * 60_000) {
      const r = await this.d.repo.regrasAbertura().catch(() => [] as RegraAbertura[]);
      this.regras = { em: agora, regras: r.length ? r : REGRAS_ABERTURA_PADRAO };
    }
    return this.regras.regras;
  }

  /** Calcula as participações da abertura a partir do estado e grava (substitui as anteriores). */
  private async gravarParticipacoes(estado: EstadoConcurso, t0: Date): Promise<number> {
    const participacoes = calcularParticipacoes(
      { t0, janelaMin: this.cfg.janelaMin, participacaoMin: this.cfg.participacaoMin },
      [...estado.boloes.values()].map(bolaoDaAbertura),
    );
    await this.d.repo.salvarAbertura(
      estado,
      {
        t0,
        janelaMin: this.cfg.janelaMin,
        participacaoMin: this.cfg.participacaoMin,
        processadaEm: this.d.relogio.agora(),
        escopoColocacao: this.d.fonte.escopoColocacao ?? 'vitrine',
      },
      participacoes,
    );
    return participacoes.length;
  }

  /** Fim da janela (T0 + 60 min): grava abertura_participacoes, base do Raio-X. */
  private async fecharAbertura(t: Extract<Tarefa, { tipo: 'abertura' }>): Promise<ResumoTarefa> {
    const { repo, relogio } = this.d;
    const ref = t.concurso;
    const coletaId = await repo.iniciarColeta({
      tipo: 'abertura', modo: 'abertura', modalidade: ref.modalidade, concurso: ref.concurso, agendadaPara: t.agendadaPara, iniciouEm: relogio.agora(),
    });
    try {
      const n = await this.gravarParticipacoes(await this.estado(ref), t.t0);
      await repo.finalizarColeta(coletaId, { terminouEm: relogio.agora(), itens: n, completa: true });
      this.d.log.info({ concurso: chaveConcurso(ref), participacoes: n }, 'abertura processada');
      return { ok: true, itens: n };
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      this.d.log.error({ tarefa: t.chave, erro }, 'falha ao processar a abertura');
      await repo.finalizarColeta(coletaId, { terminouEm: relogio.agora(), erro }).catch(() => {});
      return { ok: false, erro };
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
    if (erro instanceof ConfirmacaoHumanaNecessariaError) {
      // idade/termos/login/sessão expirada: só uma pessoa resolve; tenta de novo de tempos em tempos
      // (o adaptador recarrega sozinho quando o arquivo de sessão for renovado)
      this.pausadoAte = this.d.relogio.agora().getTime() + this.cfg.pausaAcaoHumanaMs;
    } else if (erro instanceof BloqueadoPelaFonteError) {
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
      const vazioAntes = estado.boloes.size === 0;
      // modo abertura: leitura completa enquanto couber no intervalo; senão só a borda da 1ª fila
      const plano =
        t.modo === 'abertura'
          ? planejarLeitura({
              agora: relogio.agora().getTime(),
              intervaloMs: this.cfg.intervaloAberturaMs,
              duracaoUltimaCompletaMs: this.ultimaCompleta.get(k)?.duracaoMs ?? null,
              ultimaCompletaEm: this.ultimaCompleta.get(k)?.em ?? null,
              completaACadaMs: this.cfg.completaACadaMs,
              ...resumoFilas(estado),
            })
          : ({ tipo: 'completa' } as const);
      const leitura =
        plano.tipo === 'borda'
          ? await lerPaginas(this.d.fonte, ref, plano.paginas, { agora: () => relogio.agora() })
          : await varrerConcurso(this.d.fonte, ref, { maxPaginas: this.cfg.maxPaginas[t.modo], agora: () => relogio.agora() });
      if (plano.tipo === 'completa' && leitura.completa) {
        this.ultimaCompleta.set(k, { em: leitura.iniciouEm.getTime(), duracaoMs: leitura.terminouEm.getTime() - leitura.iniciouEm.getTime() });
      }
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
      // 1º bolão do concurso: confere o T0 previsto e ajusta se a abertura foi em outro horário
      if (vazioAntes && r.novos.length && t.t0) {
        const primeiro = r.novos.reduce((m, b) => (b.firstSeenAt < m ? b.firstSeenAt : m), r.novos[0]!.firstSeenAt);
        const ajuste = ajustarT0({
          previsto: t.t0,
          origem: t.t0Origem ?? 'regra',
          ultimaLeituraVaziaEm: estado.ultimaLeituraVaziaEm,
          primeiroVistoEm: primeiro,
        });
        if (ajuste) {
          await repo.ajustarAbreEm(ref, ajuste.abreEm, ajuste.origem);
          this.d.log.warn({ concurso: k, previsto: t.t0.toISOString(), ajustado: ajuste.abreEm.toISOString() }, 'T0 ajustado pelo 1º bolão');
        }
      }
      if (leitura.erro) this.falha(t, leitura.erro);
      else this.saude.registrarSucesso();
      await repo.finalizarColeta(coletaId, {
        terminouEm: relogio.agora(),
        itens: leitura.itens.length,
        paginas: leitura.paginasLidas,
        completa: leitura.completa,
        novos: r.novos.length,
        eventos: r.eventos.length,
        estrategia: plano.tipo,
        ...(leitura.erro ? { erro: `leitura parcial: ${leitura.erro.message}` } : {}),
        ...(leitura.desvioServidorMs !== undefined ? { desvioServidorMs: Math.round(leitura.desvioServidorMs) } : {}),
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
      const regras = await this.regrasAbertura();
      const salvar: ConcursoParaSalvar[] = [];
      for (const c of abertos) {
        salvar.push({
          modalidade: c.modalidade,
          concurso: c.concurso,
          origem: 'fonte',
          ...(c.dataSorteio ? { dataSorteio: c.dataSorteio } : {}),
          ...(c.sorteioEm ? { sorteioEm: c.sorteioEm } : {}),
          ...(c.fechaEm ? { fechaEm: c.fechaEm } : {}),
          ...(c.premioEstimado !== undefined ? { premioEstimado: c.premioEstimado } : {}),
          ...(c.acumulado !== undefined ? { acumulado: c.acumulado } : {}),
          ...(c.especial !== undefined ? { especial: c.especial } : {}),
        });
        const prox = c.especial ? null : preverAbertura(c, regras);
        if (prox) {
          salvar.push({ modalidade: prox.modalidade, concurso: prox.concurso, abreEm: prox.abreEm, abreEmOrigem: 'regra', abreEmRegra: prox.regra, origem: 'previsao' });
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
      // com a sobra final conhecida, recalcula a abertura (% vendido e sobra do Raio-X)
      if (t.t0) await this.gravarParticipacoes(estado, t.t0);
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
