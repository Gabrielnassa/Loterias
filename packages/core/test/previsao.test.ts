import { describe, expect, it } from 'vitest';
import { backtestPrevisao, preverPorParecidos, resumirConcurso, type ConcursoComBoloes } from '../mercado/previsao';
import { retratoMercado } from '../mercado/vitrine';
import { gerarHistoricoSimulado } from '../simulacao/historico';
import { vitrineSimulada } from '../simulacao/mercado-simulado';
import { horarioSP } from '../tempo/fuso';

/** Previsão de fechamento por concursos parecidos, testada com o histórico SIMULADO. */
const AGORA = horarioSP(2026, 11, 21, 12, 0);
const h = gerarHistoricoSimulado({ ate: AGORA, semanas: 5, nLotericas: 150 });
const concursos: ConcursoComBoloes[] = h.planos
  .filter((p) => p.modalidade === 'lotofacil')
  .map((p) => {
    const sim = h.verdade(p.id)!;
    return { chave: p.id, abreEm: p.t0.getTime(), fechaEm: sim.fechaEm.getTime(), boloes: vitrineSimulada(sim, Math.min(AGORA.getTime(), sim.fechaEm.getTime())) };
  })
  .sort((a, b) => a.abreEm - b.abreEm);
const fechados = concursos.filter((c) => c.fechaEm <= AGORA.getTime());

describe('previsão de fechamento por concursos parecidos', () => {
  it('resumo na mesma fração da janela e o que sobrou no fechamento', () => {
    const c = fechados.at(-1)!;
    const r = resumirConcurso(c, 0.3);
    const t = c.abreEm + (c.fechaEm - c.abreEm) * 0.3;
    expect(r.estado.boloesAVenda).toBe(retratoMercado(c.boloes, t, { fechaEm: c.fechaEm }).boloes);
    expect(r.final!.cotasSobra).toBe(retratoMercado(c.boloes, c.fechaEm - 1, { fechaEm: c.fechaEm }).cotas);
    expect(Object.values(r.final!.porFaixa).reduce((s, f) => s + f.sobra, 0)).toBe(r.final!.cotasSobra);
    expect(r.picoFracao).toBeGreaterThan(0);
    expect(r.picoFracao).toBeLessThanOrEqual(1);
  });
  it('prevê a sobra com faixa de 80%, pico, mínimo para zerar e os parecidos', () => {
    const alvo = fechados.at(-1)!;
    const anteriores = fechados.slice(0, -1).map((c) => resumirConcurso(c, 0.4));
    const agora = alvo.abreEm + (alvo.fechaEm - alvo.abreEm) * 0.4;
    const r = resumirConcurso(alvo, 0.4, { agora }); // como se estivesse em andamento
    expect(r.final).toBeNull();
    const p = preverPorParecidos(r, anteriores, { agora })!;
    expect(p.parecidos).toHaveLength(8);
    expect(p.cotasSobra.min).toBeLessThanOrEqual(p.cotasSobra.previsto);
    expect(p.cotasSobra.previsto).toBeLessThanOrEqual(p.cotasSobra.max);
    expect(p.boloesSobra.max).toBeLessThanOrEqual(r.estado.boloesAVenda * 2);
    // mínimo para zerar = o que está à venda / horas até fechar
    const horas = (alvo.fechaEm - agora) / 3_600_000;
    expect(p.minimoParaZerar!.cotasPorHora).toBe(Math.ceil(r.estado.cotasAVenda / horas));
    expect(p.picoEm!.getTime()).toBeGreaterThanOrEqual(alvo.abreEm);
    expect(p.picoEm!.getTime()).toBeLessThanOrEqual(alvo.fechaEm);
    expect(p.parecidos.every((x) => x.abreEm.getTime() < alvo.abreEm)).toBe(true);
    // a sobra real do alvo fica perto da previsão (simulação estável)
    const real = resumirConcurso(alvo, 0.4).final!.cotasSobra;
    expect(Math.abs(real - p.cotasSobra.previsto) / real).toBeLessThan(0.35);
    expect(p.sobraPorFaixa.map((f) => f.faixa)).toContain('R$ 50-100');
  });
  it('sem histórico suficiente não prevê', () => {
    const r = resumirConcurso(fechados.at(-1)!, 0.5);
    expect(preverPorParecidos(r, fechados.slice(0, 2).map((c) => resumirConcurso(c, 0.5)))).toBeNull();
  });
  it('backtest sem olhar o futuro: acerto da faixa e erro mediano', () => {
    const resumos = fechados.map((c) => resumirConcurso(c, 0.3));
    const b = backtestPrevisao(resumos, { ultimos: 16 });
    expect(b.n).toBe(16);
    expect(b.acertos / b.n).toBeGreaterThanOrEqual(0.5); // faixa de 80%
    expect(b.erroMedianoPct!).toBeLessThan(0.3);
    // cada previsão do backtest só usou concursos fechados antes da abertura do alvo
    for (const it of b.itens) {
      const r = resumos.find((x) => x.chave === it.chave)!;
      const p = preverPorParecidos(r, resumos.filter((x) => x.fechaEm <= r.abreEm))!;
      expect(p.cotasSobra.previsto).toBe(it.previsto);
    }
  });
});
