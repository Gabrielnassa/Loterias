import { describe, expect, it } from 'vitest';
import { bolaoDaAbertura, calcularParticipacoes } from '../abertura/participacao';
import { aplicarLeitura, novoEstadoConcurso } from '../eventos/estado';
import { buscarLotericas } from '../raio-x/busca';
import { metricasSemanais } from '../raio-x/semanal';
import {
  aberturaAoVivoSimulada,
  coletarSimulacao,
  cronogramaAbertura,
  gerarAberturaSimulada,
  gerarHistoricoSimulado,
  leituraSimulada,
} from '../simulacao';
import { horarioSP, semanaSP } from '../tempo/fuso';

const T0 = horarioSP(2026, 11, 16, 21, 45);

describe('coletor rápido de simulação', () => {
  it.each([11, 12, 13])('semente %i: igual ao pipeline completo (leitura a leitura)', (semente) => {
    const sim = gerarAberturaSimulada({ semente, t0: T0, nBoloes: 200 });
    const estado = novoEstadoConcurso(sim);
    for (const t of cronogramaAbertura(T0)) aplicarLeitura(estado, leituraSimulada(sim, t));
    const fim = cronogramaAbertura(T0).at(-1)!;
    const rapido = coletarSimulacao(sim, { ate: fim });
    expect(rapido).toHaveLength(estado.boloes.size);
    for (const b of rapido) {
      const reg = estado.boloes.get(b.id)!;
      expect(b.firstSeenAt).toEqual(reg.firstSeenAt);
      expect(b.fila).toBe(reg.fila);
      expect(b.posEntrada).toEqual(reg.posEntradaObservada);
      expect(b.empate).toBe(reg.empateEntrada);
      expect(b.cotasDisponiveis).toBe(reg.cotasDisponiveis);
    }
    const a = calcularParticipacoes({ t0: T0 }, rapido);
    const p = calcularParticipacoes({ t0: T0 }, [...estado.boloes.values()].map(bolaoDaAbertura));
    expect(a.map((x) => [x.loterica.codigoCaixa, x.atrasoS, x.posUf, x.nBoloes1h])).toEqual(p.map((x) => [x.loterica.codigoCaixa, x.atrasoS, x.posUf, x.nBoloes1h]));
  });
});

describe('histórico simulado', () => {
  const ate = horarioSP(2026, 11, 21, 12, 0); // sábado ao meio-dia
  const h = gerarHistoricoSimulado({ ate, semanas: 13 });

  it('13 semanas de aberturas no calendário simulado, só janelas terminadas', () => {
    expect(new Set(h.aberturas.map((a) => semanaSP(a.t0))).size).toBe(13);
    expect(h.aberturas.every((a) => a.t0.getTime() + 3600_000 <= ate.getTime())).toBe(true);
    expect(h.aberturas.length).toBeGreaterThan(180);
    expect(h.lotericas).toHaveLength(800);
    expect(new Set(h.lotericas.map((l) => l.codigoCaixa)).size).toBe(800);
  });

  it('é determinístico', () => {
    const outro = gerarHistoricoSimulado({ ate, semanas: 13 });
    expect(outro.participacoes.length).toBe(h.participacoes.length);
    expect(outro.participacoes[50]).toEqual(h.participacoes[50]);
  });

  it('a lotérica de demonstração abre com frequência e cedo', () => {
    const minha = h.lotericas[0]!;
    expect(minha.nome).toBe('Lotérica Trevo de Ouro');
    const m = metricasSemanais(minha.codigoCaixa, h.aberturas, h.participacoes, { ate, semanas: 12 });
    const media = m.slice(1).reduce((s, x) => s + (x.taxa ?? 0), 0) / 11;
    expect(media).toBeGreaterThan(0.5);
    expect(m[1]!.atrasoMedianoS!).toBeLessThan(120);
  });

  it('detalhe da abertura regenera os bolões (tela 2)', () => {
    const a = h.aberturas.at(-1)!;
    const boloes = h.detalhar(a.id)!;
    const parts = h.participacoes.filter((p) => p.aberturaId === a.id);
    expect(boloes.length).toBeGreaterThanOrEqual(parts.length);
    for (const p of parts) expect(boloes.some((b) => b.loterica.codigoCaixa === p.lotericaCodigo)).toBe(true);
    expect(h.detalhar('nao-existe')).toBeNull();
  });

  it('ao vivo: abertura em andamento com a ordem de chegada até agora', () => {
    const agora = new Date(Math.floor(ate.getTime() / 1_200_000) * 1_200_000 + 4 * 60_000);
    const av = aberturaAoVivoSimulada(h, agora);
    expect(av.t0.getTime()).toBeLessThanOrEqual(agora.getTime());
    expect(av.participacoes.length).toBeGreaterThan(5);
    expect(av.participacoes.every((p) => p.primeiroEm.getTime() <= agora.getTime())).toBe(true);
    const depois = aberturaAoVivoSimulada(h, new Date(agora.getTime() + 60_000));
    expect(depois.participacoes.length).toBeGreaterThanOrEqual(av.participacoes.length);
  });
});

describe('busca de lotérica', () => {
  const ls = [
    { codigoCaixa: '980011', nome: 'Lotérica Trevo de Ouro', cidade: 'São Paulo', uf: 'SP' },
    { codigoCaixa: '980048', nome: 'Lotérica Sorte Grande', cidade: 'Campinas', uf: 'SP' },
    { codigoCaixa: '981234', nome: 'Casa do Trevo', cidade: 'Rio de Janeiro', uf: 'RJ' },
  ];
  it('por código, nome e cidade, sem acento', () => {
    expect(buscarLotericas(ls, '980048')[0]!.nome).toBe('Lotérica Sorte Grande');
    expect(buscarLotericas(ls, '9800').map((l) => l.codigoCaixa)).toEqual(['980048', '980011']); // empate: ordem alfabética
    expect(buscarLotericas(ls, 'trevo').map((l) => l.codigoCaixa)).toEqual(['981234', '980011']);
    expect(buscarLotericas(ls, 'sorte campinas').map((l) => l.codigoCaixa)).toEqual(['980048']);
    expect(buscarLotericas(ls, 'sao paulo').map((l) => l.codigoCaixa)).toEqual(['980011']);
    expect(buscarLotericas(ls, '   ')).toEqual([]);
  });
});

describe('histórico serializado (demonstração estática)', () => {
  it('remonta o mesmo histórico a partir do JSON compacto', async () => {
    const { gerarHistoricoSimulado, serializarHistorico, reconstruirHistorico } = await import('../simulacao/historico');
    const { horarioSP: hsp } = await import('../tempo/fuso');
    const ate = hsp(2026, 11, 21, 12, 0);
    const h = gerarHistoricoSimulado({ ate, semanas: 2, nLotericas: 60 });
    const json = JSON.parse(JSON.stringify(serializarHistorico(h, ate)));
    const r = reconstruirHistorico(json);
    expect(r.planos.map((p) => p.id)).toEqual(h.planos.map((p) => p.id));
    expect(r.aberturas.map((p) => p.id)).toEqual(h.aberturas.map((p) => p.id));
    expect(r.participacoes).toHaveLength(h.participacoes.length);
    const a = h.participacoes[5]!;
    const b = r.participacoes[5]!;
    expect({ ...b, primeiroEm: b.primeiroEm.getTime() }).toEqual({ ...a, primeiroEm: a.primeiroEm.getTime(), atrasoS: Math.round(a.atrasoS * 1000) / 1000, pctVendido: a.pctVendido === null ? null : Math.round(a.pctVendido! * 1000) / 1000, empate: a.empate ?? false });
    const id = h.aberturas.at(-1)!.id;
    expect(r.detalhar(id)!.length).toBe(h.detalhar(id)!.length);
    expect(r.verdade(id)!.boloes.length).toBe(h.verdade(id)!.boloes.length);
  });
});
