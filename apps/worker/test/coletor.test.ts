import {
  BloqueadoPelaFonteError,
  FonteIndisponivelError,
  horaSP,
  horarioSP,
  type FonteBoloes,
  type Tarefa,
} from '@radar/core';
import { FonteSimulada, gerarAberturaSimulada, type AberturaSimulada } from '@radar/core/simulacao';
import { describe, expect, it } from 'vitest';
import { Agendador } from '../src/agendador';
import { Coletor } from '../src/coletor';
import { criarFilaMemoria } from '../src/filas';
import { logMudo } from '../src/log';
import { RelogioManual } from '../src/relogio';
import { RepositorioMemoria } from '../src/repositorio/memoria';

const T0 = horarioSP(2026, 11, 16, 21, 45);

function montar(sim: AberturaSimulada, fonte?: FonteBoloes) {
  const relogio = new RelogioManual(T0.getTime() - 2 * 60_000);
  const repo = new RepositorioMemoria();
  const alertas: unknown[] = [];
  const coletor = new Coletor({ fonte: fonte ?? new FonteSimulada([sim], () => relogio.agora()), repo, relogio, log: logMudo, alertar: (a) => alertas.push(a) });
  const fila = criarFilaMemoria(coletor, logMudo, 4);
  const agendador = new Agendador({ repo, relogio, log: logMudo, despachar: (t) => fila.despachar(t), ocupado: (t) => fila.ocupado(t), recarregarConcursosMs: 1000 });
  const rodarAte = async (ate: Date, passoMs = 1000) => {
    while (relogio.agora().getTime() <= ate.getTime()) {
      await agendador.tick();
      await fila.ociosa();
      relogio.avancar(passoMs);
    }
  };
  return { relogio, repo, coletor, agendador, alertas, rodarAte };
}

describe('coletor de ponta a ponta (agendador + fila + coletor + repositório)', () => {
  it('abertura simulada: 372 leituras no modo abertura, sem perdas, e depois o modo normal', async () => {
    const sim = gerarAberturaSimulada({ semente: 11, t0: T0, nBoloes: 200, concurso: 3500 });
    const { repo, agendador, rodarAte } = montar(sim);
    await repo.salvarConcursos([{ modalidade: 'lotofacil', concurso: 3500, abreEm: T0, fechaEm: sim.fechaEm, origem: 'manual' }]);
    await rodarAte(new Date(T0.getTime() + 61 * 60_000));

    const abertura = repo.coletas.filter((c) => c.tipo === 'varredura' && c.modo === 'abertura');
    expect(abertura).toHaveLength(372);
    expect(abertura.every((c) => !c.erro && c.completa)).toBe(true);
    expect(horaSP(abertura[0]!.agendadaPara!)).toBe('21:44:00');
    expect(agendador.estatisticas.slotsPerdidos).toBe(0);
    expect(repo.coletas.some((c) => c.tipo === 'varredura' && c.modo === 'normal')).toBe(true);
    expect(repo.coletas.filter((c) => c.tipo === 'contagens').length).toBeGreaterThanOrEqual(62);

    // bolões, eventos e precisão
    const novos = repo.eventos.filter((e) => e.tipo === 'bolao_novo');
    expect(novos).toHaveLength(repo.boloes.size);
    expect(repo.boloes.size).toBeGreaterThan(150);
    for (const b of sim.boloes) {
      const reg = repo.boloes.get(b.bolao.idCaixa);
      if (!reg) continue;
      const erro = reg.firstSeenAt.getTime() - b.chegadaEm.getTime();
      expect(erro).toBeGreaterThanOrEqual(0);
      expect(erro).toBeLessThanOrEqual(b.chegadaEm.getTime() < T0.getTime() + 15 * 60_000 ? 5000 : 15000);
      expect(reg.fila).toBe(b.fila);
    }
    // mercado por minuto (BR e UFs)
    const ufs = new Set([...repo.mercado.values()].map((m) => m.uf));
    expect(ufs.has('BR')).toBe(true);
    expect(ufs.has('SP')).toBe(true);
  });

  it('contagens sincronizam concursos e preveem a próxima abertura', async () => {
    const sim = gerarAberturaSimulada({ semente: 3, t0: T0, nBoloes: 30, concurso: 3500 });
    const { repo, rodarAte } = montar(sim);
    await rodarAte(new Date(T0.getTime() + 61_000));
    const prox = repo.concursos.get('lotofacil#3501');
    expect(prox?.origem).toBe('previsao');
    expect(horaSP(prox!.abreEm!)).toBe('21:45:00');
    expect(repo.concursos.get('lotofacil#3500')?.origem).toBe('fonte');
  });

  it('encerra o concurso no fechamento: evento encerrou e sobra final', async () => {
    const fechaEm = new Date(T0.getTime() + 10 * 60_000);
    const sim = gerarAberturaSimulada({ semente: 5, t0: T0, nBoloes: 40, concurso: 3500, fechaEm });
    const { repo, rodarAte } = montar(sim);
    await repo.salvarConcursos([{ modalidade: 'lotofacil', concurso: 3500, abreEm: T0, fechaEm, origem: 'manual' }]);
    await rodarAte(new Date(fechaEm.getTime() + 5000));
    const encerrou = repo.eventos.filter((e) => e.tipo === 'encerrou');
    expect(encerrou.length).toBe(repo.boloes.size);
    expect([...repo.boloes.values()].every((b) => b.status === 'encerrado' && b.sobraFinal !== null)).toBe(true);
    expect(repo.concursos.get('lotofacil#3500')?.encerrado).toBe(true);
    expect(repo.coletas.filter((c) => c.tipo === 'encerrar')).toHaveLength(1);
  });
});

describe('falhas da fonte', () => {
  const tarefa = (slot: number): Tarefa => ({
    tipo: 'varredura',
    chave: 'abertura:lotofacil#3500',
    concurso: { modalidade: 'lotofacil', concurso: 3500 },
    modo: 'abertura',
    slot,
    agendadaPara: T0,
    prioridade: 1,
  });
  const fonteQue = (erro: () => Error): FonteBoloes => ({
    nome: 'quebrada',
    concursosAbertos: async () => [],
    contagens: async () => [],
    pagina: async () => {
      throw erro();
    },
  });

  it('alerta uma vez após 3 falhas seguidas e registra o erro em coletas', async () => {
    const sim = gerarAberturaSimulada({ semente: 1, t0: T0, nBoloes: 10 });
    const { coletor, repo, alertas } = montar(sim, fonteQue(() => new FonteIndisponivelError('HTTP 503')));
    for (let i = 0; i < 5; i++) expect((await coletor.executar(tarefa(i))).ok).toBe(false);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ motivo: 'falhas_seguidas', falhasSeguidas: 3 });
    expect(repo.coletas.every((c) => c.erro === 'HTTP 503')).toBe(true);
  });

  it('bloqueio (403/captcha) pausa a coleta em vez de insistir', async () => {
    const sim = gerarAberturaSimulada({ semente: 1, t0: T0, nBoloes: 10 });
    const { coletor, alertas, relogio } = montar(sim, fonteQue(() => new BloqueadoPelaFonteError('HTTP 403', 403)));
    await coletor.executar(tarefa(0));
    expect(alertas[0]).toMatchObject({ motivo: 'bloqueado' });
    expect(await coletor.executar(tarefa(1))).toEqual({ ok: false, pulada: 'pausado' });
    relogio.avancar(31 * 60_000);
    expect((await coletor.executar(tarefa(2))).pulada).toBeUndefined();
  });

  it('falha ao gravar descarta o estado em memória e a leitura seguinte refaz os bolões novos', async () => {
    const sim = gerarAberturaSimulada({ semente: 2, t0: T0, nBoloes: 60 });
    const { coletor, repo, relogio } = montar(sim);
    relogio.definir(new Date(T0.getTime() + 60_000));
    repo.falharAoSalvar = true;
    expect((await coletor.executar(tarefa(24))).ok).toBe(false);
    expect(repo.boloes.size).toBe(0);
    repo.falharAoSalvar = false;
    relogio.avancar(5000);
    const r = await coletor.executar(tarefa(25));
    expect(r.ok).toBe(true);
    expect(r.novos).toBeGreaterThan(0);
    expect(repo.boloes.size).toBe(r.novos);
  });
});

describe('agendador', () => {
  it('não sobrepõe leituras do mesmo concurso e conta o slot perdido', async () => {
    const repo = new RepositorioMemoria();
    await repo.salvarConcursos([{ modalidade: 'lotofacil', concurso: 3500, abreEm: T0, origem: 'manual' }]);
    const relogio = new RelogioManual(T0.getTime());
    const despachadas: Tarefa[] = [];
    let ocupado = false;
    const ag = new Agendador({ repo, relogio, log: logMudo, despachar: (t) => void despachadas.push(t), ocupado: (t) => ocupado && t.tipo === 'varredura' });
    await ag.tick();
    expect(despachadas.map((t) => t.tipo).sort()).toEqual(['contagens', 'varredura']);
    ocupado = true;
    relogio.avancar(5000);
    await ag.tick();
    expect(ag.estatisticas.puladasOcupado).toBe(1);
    ocupado = false;
    relogio.avancar(5000);
    await ag.tick();
    expect(despachadas.filter((t) => t.tipo === 'varredura').map((t) => t.slot)).toEqual([12, 14]);
    expect(ag.estatisticas.slotsPerdidos).toBe(1);
  });

  it('tick atrasado pula para o slot atual (sem fila acumulada) e conta os perdidos', async () => {
    const repo = new RepositorioMemoria();
    await repo.salvarConcursos([{ modalidade: 'lotofacil', concurso: 3500, abreEm: T0, origem: 'manual' }]);
    const relogio = new RelogioManual(T0.getTime());
    const despachadas: Tarefa[] = [];
    const ag = new Agendador({ repo, relogio, log: logMudo, despachar: (t) => void despachadas.push(t) });
    await ag.tick();
    relogio.avancar(20_000);
    await ag.tick();
    expect(despachadas.filter((t) => t.tipo === 'varredura').map((t) => t.slot)).toEqual([12, 16]);
    expect(ag.estatisticas.slotsPerdidos).toBe(3);
  });
});
