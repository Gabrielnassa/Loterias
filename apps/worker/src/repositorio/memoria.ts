import {
  chaveConcurso,
  type BolaoRegistrado,
  type ConcursoAgendavel,
  type ConcursoRef,
  type EventoBolao,
  type LinhaMercado,
  type LinhaSnapshot,
  type OrigemT0,
  type Participacao,
  type RegraAbertura,
  type ResultadoLeitura,
  type ResultadoOficial,
} from '@radar/core';
import type { AberturaParaSalvar, ConcursoParaSalvar, FimColeta, InicioColeta, Repositorio } from './tipos';

type ConcursoMem = ConcursoAgendavel & { origem: ConcursoParaSalvar['origem']; dataSorteio?: string; encerradoEm?: Date; abreEmPrevisto?: Date };

/** Repositório em memória: mesmo contrato do Postgres, para testes e `REPOSITORIO=memoria`. */
export class RepositorioMemoria implements Repositorio {
  readonly concursos = new Map<string, ConcursoMem>();
  readonly boloes = new Map<string, BolaoRegistrado>();
  readonly snapshots: (LinhaSnapshot & { coletaId: number })[] = [];
  readonly eventos: (EventoBolao & { coletaId: number })[] = [];
  readonly coletas: (InicioColeta & Partial<FimColeta> & { id: number })[] = [];
  readonly mercado = new Map<string, LinhaMercado & { minuto: Date }>();
  readonly aberturas = new Map<string, AberturaParaSalvar & { participacoes: Participacao[] }>();
  falharAoSalvar = false;

  async concursosAgendaveis(agora: Date): Promise<ConcursoAgendavel[]> {
    return [...this.concursos.values()]
      .filter((c) => !c.encerradoEm)
      .filter((c) => c.origem !== 'previsao' || !c.abreEm || c.abreEm.getTime() > agora.getTime() - 3 * 3_600_000)
      .map(({ modalidade, concurso, abreEm, abreEmOrigem, fechaEm, encerrado }) => ({
        modalidade, concurso, abreEm, fechaEm, encerrado, abreEmOrigem: abreEmOrigem ?? 'regra',
        aberturaProcessada: this.aberturas.has(chaveConcurso({ modalidade, concurso })),
      }));
  }

  async salvarConcursos(cs: readonly ConcursoParaSalvar[]): Promise<void> {
    for (const c of cs) {
      const k = chaveConcurso(c);
      const atual = this.concursos.get(k);
      if (!atual) {
        this.concursos.set(k, { ...c, abreEmOrigem: c.abreEmOrigem ?? (c.origem === 'manual' ? 'manual' : 'regra') });
        continue;
      }
      if (!atual.abreEm && c.abreEm) {
        atual.abreEm = c.abreEm;
        atual.abreEmOrigem = c.abreEmOrigem ?? 'regra';
      }
      atual.fechaEm = c.fechaEm ?? atual.fechaEm;
      atual.dataSorteio = c.dataSorteio ?? atual.dataSorteio;
      if (c.origem === 'fonte') atual.origem = 'fonte';
    }
  }

  async carregarEstado(ref: ConcursoRef): Promise<BolaoRegistrado[]> {
    return [...this.boloes.values()]
      .filter((b) => b.modalidade === ref.modalidade && b.concurso === ref.concurso)
      .map((b) => structuredClone(b));
  }

  async iniciarColeta(c: InicioColeta): Promise<number> {
    const id = this.coletas.length + 1;
    this.coletas.push({ ...c, id });
    return id;
  }

  async finalizarColeta(id: number, fim: FimColeta): Promise<void> {
    Object.assign(this.coletas[id - 1]!, fim);
  }

  async salvarLeitura(_ref: ConcursoRef, r: ResultadoLeitura, coletaId: number, vistoEm: Date): Promise<void> {
    if (this.falharAoSalvar) throw new Error('falha simulada ao salvar');
    for (const b of [...r.novos, ...r.alterados]) this.boloes.set(b.idCaixa, structuredClone(b));
    for (const id of r.vistos) {
      const b = this.boloes.get(id);
      if (b) b.lastSeenAt = vistoEm;
    }
    for (const l of r.linhas) this.snapshots.push({ ...l, coletaId });
    for (const e of r.eventos) this.eventos.push({ ...e, coletaId });
  }

  async salvarMercado(ref: ConcursoRef, minuto: Date, linhas: readonly LinhaMercado[]): Promise<void> {
    for (const l of linhas) this.mercado.set(`${chaveConcurso(ref)}|${l.uf}|${minuto.toISOString()}`, { ...l, minuto });
  }

  readonly resultados = new Map<string, ResultadoOficial>();
  async concursosSemResultado(agora: Date, limite: number): Promise<ConcursoRef[]> {
    return [...this.concursos.values()]
      .filter((c) => c.encerradoEm && c.encerradoEm.getTime() <= agora.getTime() && c.encerradoEm.getTime() > agora.getTime() - 7 * 86_400_000)
      .filter((c) => !this.resultados.has(chaveConcurso(c)))
      .slice(0, limite)
      .map(({ modalidade, concurso }) => ({ modalidade, concurso }));
  }
  async salvarResultado(ref: ConcursoRef, resultado: ResultadoOficial): Promise<void> {
    this.resultados.set(chaveConcurso(ref), resultado);
  }

  regras: RegraAbertura[] = [];
  async regrasAbertura(): Promise<RegraAbertura[]> {
    return this.regras;
  }

  async ajustarAbreEm(ref: ConcursoRef, abreEm: Date, origem: OrigemT0): Promise<void> {
    const c = this.concursos.get(chaveConcurso(ref));
    if (!c) return;
    c.abreEmPrevisto ??= c.abreEm ?? undefined;
    c.abreEm = abreEm;
    c.abreEmOrigem = origem;
  }

  async salvarAbertura(ref: ConcursoRef, a: AberturaParaSalvar, participacoes: readonly Participacao[]): Promise<void> {
    this.aberturas.set(chaveConcurso(ref), { ...a, participacoes: structuredClone([...participacoes]) });
  }

  async marcarEncerrado(ref: ConcursoRef, em: Date): Promise<void> {
    const c = this.concursos.get(chaveConcurso(ref));
    if (c) {
      c.encerradoEm = em;
      c.encerrado = true;
    }
  }
}
