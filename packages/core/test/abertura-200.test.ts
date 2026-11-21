import { beforeAll, describe, expect, it } from 'vitest';
import { bolaoDaAbertura, calcularParticipacoes, ordemDeChegada, type Participacao } from '../abertura/participacao';
import { CONFIG_COLETA_PADRAO } from '../coleta/plano';
import { aplicarLeitura, novoEstadoConcurso, type EstadoConcurso } from '../eventos/estado';
import { varrerConcurso } from '../fonte/varredura';
import { calcularPosicoes, pagina, type BolaoNaVitrine } from '../regras/posicao';
import {
  cronogramaAbertura,
  esgotaEm,
  FonteSimulada,
  gerarAberturaSimulada,
  leituraSimulada,
  type AberturaSimulada,
} from '../simulacao';
import { horarioSP } from '../tempo/fuso';

/**
 * Abertura simulada de 200 bolões passando pelo pipeline real: leituras no cronograma do modo
 * abertura (5 s até T0+15 min, depois 15 s) -> eventos -> fila/posição -> participações.
 * A simulação conhece a VERDADE (horário exato de chegada, fila real, vendas), então dá para
 * medir o erro do coletor.
 */
const T0 = horarioSP(2026, 11, 16, 21, 45);
const JANELA_MS = 60 * 60_000;
const PARTICIPACAO_MS = 30 * 60_000;

let sim: AberturaSimulada;
let estado: EstadoConcurso;
let leituras: Date[];
let participacoes: Participacao[];

/** Intervalo de leitura vigente no instante t (5 s nos primeiros 15 min, depois 15 s). */
function intervaloEm(t: number): number {
  return t < T0.getTime() + CONFIG_COLETA_PADRAO.aberturaRapidaMs ? CONFIG_COLETA_PADRAO.intervaloRapidoMs : CONFIG_COLETA_PADRAO.intervaloLentoMs;
}

/** Verdade em formato de vitrine, para calcular posições "reais". */
function verdadeComoVitrine(): BolaoNaVitrine[] {
  return sim.boloes.map((b) => {
    const fim = esgotaEm(b);
    return {
      id: b.bolao.idCaixa,
      lotericaCodigo: b.bolao.loterica.codigoCaixa,
      loterica: b.bolao.loterica,
      fila: b.fila,
      firstSeenAt: b.chegadaEm,
      saiuEm: fim === null ? null : new Date(fim),
    };
  });
}

beforeAll(() => {
  sim = gerarAberturaSimulada({ semente: 20261116, t0: T0, nBoloes: 200, modalidade: 'lotofacil', concurso: 3500 });
  estado = novoEstadoConcurso(sim);
  leituras = cronogramaAbertura(T0);
  for (const t of leituras) aplicarLeitura(estado, leituraSimulada(sim, t));
  participacoes = calcularParticipacoes({ t0: T0 }, [...estado.boloes.values()].map(bolaoDaAbertura));
});

describe('abertura simulada de 200 bolões', () => {
  it('a simulação tem 200 bolões, várias filas, cidades e UFs', () => {
    expect(sim.boloes).toHaveLength(200);
    expect(new Set(sim.boloes.map((b) => b.bolao.loterica.uf)).size).toBeGreaterThanOrEqual(5);
    expect(Math.max(...sim.boloes.map((b) => b.fila))).toBeGreaterThanOrEqual(4);
    expect(leituras).toHaveLength(372);
  });

  it('nenhum bolão aparece antes de T0 (leituras de T0 − 1 min vêm vazias)', () => {
    expect(leituraSimulada(sim, new Date(T0.getTime() - 1)).itens).toHaveLength(0);
    for (const b of estado.boloes.values()) expect(b.firstSeenAt.getTime()).toBeGreaterThanOrEqual(T0.getTime());
  });

  it('detecta todo bolão que chegou na janela e esteve visível numa leitura', () => {
    const fimLeituras = leituras[leituras.length - 1]!.getTime();
    const deveriamSerVistos = sim.boloes.filter((b) => {
      const t = b.chegadaEm.getTime();
      if (t > fimLeituras) return false;
      const proxima = leituras.find((l) => l.getTime() >= t)!;
      const fim = esgotaEm(b);
      return fim === null || fim > proxima.getTime();
    });
    for (const b of deveriamSerVistos) expect(estado.boloes.has(b.bolao.idCaixa), b.bolao.idCaixa).toBe(true);
    expect(estado.boloes.size).toBe(deveriamSerVistos.length);
  });

  it('precisão do first_seen_at: erro em [0, 5 s] até T0 + 15 min e [0, 15 s] depois', () => {
    let maxRapido = 0;
    for (const b of sim.boloes) {
      const reg = estado.boloes.get(b.bolao.idCaixa);
      if (!reg) continue;
      const erro = reg.firstSeenAt.getTime() - b.chegadaEm.getTime();
      expect(erro).toBeGreaterThanOrEqual(0);
      expect(erro).toBeLessThanOrEqual(intervaloEm(b.chegadaEm.getTime()));
      if (intervaloEm(b.chegadaEm.getTime()) === 5000) maxRapido = Math.max(maxRapido, erro);
    }
    expect(maxRapido).toBeLessThanOrEqual(5000);
  });

  it('fila detectada = fila real (a ordem da fonte desempata a mesma leitura)', () => {
    for (const b of sim.boloes) {
      const reg = estado.boloes.get(b.bolao.idCaixa);
      if (reg) expect(reg.fila, b.bolao.idCaixa).toBe(b.fila);
    }
  });

  it('colocação na entrada: observada = calculada = vitrine real no instante da leitura', () => {
    const verdade = verdadeComoVitrine();
    for (const reg of estado.boloes.values()) {
      expect(reg.posEntradaObservada).toEqual(reg.posEntradaCalculada);
      const real = calcularPosicoes(verdade, reg.firstSeenAt).get(reg.idCaixa)!;
      expect(reg.posEntradaObservada, reg.idCaixa).toEqual(real);
    }
  });

  it('página = teto(posição / 30) e escopos encaixados (cidade <= UF <= Brasil)', () => {
    for (const reg of estado.boloes.values()) {
      const p = reg.posEntradaCalculada;
      for (const e of ['cidade', 'uf', 'brasil'] as const) expect(p[e].pagina).toBe(pagina(p[e].posicao));
      expect(p.cidade.posicao).toBeLessThanOrEqual(p.uf.posicao);
      expect(p.uf.posicao).toBeLessThanOrEqual(p.brasil.posicao);
    }
  });

  it('vitrine final: 1ª fila inteira antes da 2ª, e assim por diante', () => {
    const final = leituraSimulada(sim, leituras[leituras.length - 1]!);
    const filas = final.itens.map((it) => estado.boloes.get(it.idCaixa)!.fila);
    for (let i = 1; i < filas.length; i++) expect(filas[i]!).toBeGreaterThanOrEqual(filas[i - 1]!);
  });

  it('participação: 1º bolão em [T0, T0 + 30 min]; diferenças só na borda dos 30 min', () => {
    const verdadeiras = new Map<string, number>();
    for (const b of sim.boloes) {
      const cod = b.bolao.loterica.codigoCaixa;
      const t = b.chegadaEm.getTime();
      if (t <= T0.getTime() + JANELA_MS && (!verdadeiras.has(cod) || t < verdadeiras.get(cod)!)) verdadeiras.set(cod, t);
    }
    const esperadas = new Set([...verdadeiras].filter(([, t]) => t <= T0.getTime() + PARTICIPACAO_MS).map(([c]) => c));
    const obtidas = new Set(participacoes.map((p) => p.loterica.codigoCaixa));
    const diferenca = [...esperadas].filter((c) => !obtidas.has(c)).concat([...obtidas].filter((c) => !esperadas.has(c)));
    for (const c of diferenca) {
      // só pode errar quem chegou a menos de 15 s (1 leitura) do limite de 30 min
      expect(Math.abs(verdadeiras.get(c)! - (T0.getTime() + PARTICIPACAO_MS))).toBeLessThanOrEqual(15_000);
    }
    expect(participacoes.length).toBeGreaterThan(30);
  });

  it('participação: atraso, colocação do 1º bolão e volume da 1ª hora batem com o estado', () => {
    for (const p of participacoes) {
      const primeiro = estado.boloes.get(p.primeiroBolaoId)!;
      expect(p.atrasoS).toBe((primeiro.firstSeenAt.getTime() - T0.getTime()) / 1000);
      expect(p.atrasoS).toBeLessThanOrEqual(30 * 60);
      expect(p.posUf).toBe(primeiro.posEntradaCalculada.uf.posicao);
      expect(p.paginaUf).toBe(pagina(p.posUf));
      const da1h = [...estado.boloes.values()].filter(
        (b) => b.loterica.codigoCaixa === p.loterica.codigoCaixa && b.firstSeenAt.getTime() <= T0.getTime() + JANELA_MS,
      );
      expect(p.nBoloes1h).toBe(da1h.length);
      expect(p.valor1h).toBeCloseTo(da1h.reduce((s, b) => s + b.cotasTotal * b.valorCotaBase, 0), 2);
      expect(p.sobra).toBeNull(); // concurso ainda não encerrou
      expect(p.pctVendido).toBeGreaterThanOrEqual(0);
      expect(p.pctVendido).toBeLessThanOrEqual(1);
    }
  });

  it('primeira leitura após T0 marca empate entre os bolões que entraram juntos', () => {
    const primeiraLeitura = Math.min(...[...estado.boloes.values()].map((b) => b.firstSeenAt.getTime()));
    const juntos = [...estado.boloes.values()].filter((b) => b.firstSeenAt.getTime() === primeiraLeitura);
    if (juntos.length > 1) expect(juntos.every((b) => b.empateEntrada)).toBe(true);
  });

  it('ordem de chegada da UF ("Ao vivo")', () => {
    const sp = ordemDeChegada(participacoes, { uf: 'SP' });
    expect(sp.length).toBeGreaterThan(5);
    expect(sp.every((p) => p.loterica.uf === 'SP')).toBe(true);
    expect(sp.map((p) => p.ordem)).toEqual(sp.map((_, i) => i + 1));
    for (let i = 1; i < sp.length; i++) expect(sp[i]!.primeiroEm.getTime()).toBeGreaterThanOrEqual(sp[i - 1]!.primeiroEm.getTime());
  });

  it('varredura paginada pela fonte simulada = leitura instantânea', async () => {
    const t = new Date(T0.getTime() + 20 * 60_000);
    const fonte = new FonteSimulada([sim], () => t);
    const paginada = await varrerConcurso(fonte, sim);
    const direta = leituraSimulada(sim, t);
    expect(paginada.completa).toBe(true);
    expect(paginada.paginasLidas).toBe(Math.max(1, Math.ceil(direta.itens.length / 30)));
    expect(paginada.itens.map((i) => i.idCaixa)).toEqual(direta.itens.map((i) => i.idCaixa));
  });
});

describe('mesmas garantias com outras sementes', () => {
  it.each([1, 7, 99])('semente %i: fila, precisão e colocação na entrada', (semente) => {
    const s = gerarAberturaSimulada({ semente, t0: T0, nBoloes: 200 });
    const e = novoEstadoConcurso(s);
    for (const t of cronogramaAbertura(T0)) aplicarLeitura(e, leituraSimulada(s, t));
    const verdade = s.boloes.map((b) => {
      const fim = esgotaEm(b);
      return { id: b.bolao.idCaixa, lotericaCodigo: b.bolao.loterica.codigoCaixa, loterica: b.bolao.loterica, fila: b.fila, firstSeenAt: b.chegadaEm, saiuEm: fim === null ? null : new Date(fim) };
    });
    for (const b of s.boloes) {
      const reg = e.boloes.get(b.bolao.idCaixa);
      if (!reg) continue;
      expect(reg.fila).toBe(b.fila);
      const erro = reg.firstSeenAt.getTime() - b.chegadaEm.getTime();
      expect(erro).toBeGreaterThanOrEqual(0);
      expect(erro).toBeLessThanOrEqual(intervaloEm(b.chegadaEm.getTime()));
      expect(reg.posEntradaCalculada).toEqual(calcularPosicoes(verdade, reg.firstSeenAt).get(reg.idCaixa));
    }
  });
});
