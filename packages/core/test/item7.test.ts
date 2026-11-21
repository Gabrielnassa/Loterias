import { describe, expect, it } from 'vitest';
import { calendarioDoMes, sorteiosDoDia } from '../calendario/sorteios';
import { COMBINACOES_LOTECA, melhorMarcacao, probabilidadesLoteca, tabelaDeMarcacoes, type ProbabilidadesJogo } from '../loteca/marcacao';
import { apostasPorJogo, simularBolao } from '../simulador/bolao';
import { horarioSP } from '../tempo/fuso';

describe('simulador de bolões com os limites oficiais', () => {
  it('Dupla Sena com 9 números (tabela oficial: 84 apostas, R$ 252, cota mínima R$ 5,04, até 50 cotas)', () => {
    const s = simularBolao({ modalidade: 'dupla-sena', numeros: 9, jogos: 1, cotas: 50, franquia: 8000 });
    expect(s).toMatchObject({ apostasPorJogo: 84, valorJogo: 252, valorBolao: 252, valorCota: 5.04, valorUltimaCota: 5.04, problemas: [] });
    expect(s.cotasPermitidas).toEqual({ min: 2, max: 50 });
    // tarifa truncada 1,76 x 50 + comissão 8,61% x 252
    expect(s.ganhoSeVenderTudo).toBe(Math.round((1.76 * 50 + 0.0861 * 252) * 100) / 100);
    expect(s.franquia).toEqual({ limite: 8000, consome: 252, cabem: 31, sobra: 188 });
    expect(simularBolao({ modalidade: 'dupla-sena', numeros: 9, jogos: 1, cotas: 51 }).problemas).toContain('no máximo 50 cotas com 9 números');
  });
  it('Super Sete com 14 números: 128 apostas, R$ 384, cota mínima R$ 3,84 (100 cotas)', () => {
    const s = simularBolao({ modalidade: 'super-sete', numeros: 14, jogos: 1, cotas: 100 });
    expect(s).toMatchObject({ apostasPorJogo: 128, valorBolao: 384, valorCota: 3.84, problemas: [] });
    expect(simularBolao({ modalidade: 'super-sete', numeros: 7, jogos: 4, cotas: 2 }).problemas).toContain('bolão de Super Sete aceita de 8 a 21 números');
  });
  it('+Milionária: 6+3 = 3 apostas (R$ 18); 12+6 = R$ 83.160, o bolão máximo', () => {
    expect(apostasPorJogo('mais-milionaria', { numeros: 6, trevos: 3 })).toBe(3);
    expect(simularBolao({ modalidade: 'mais-milionaria', numeros: 12, trevos: 6, jogos: 1, cotas: 100 })).toMatchObject({ valorBolao: 83_160, valorCota: 831.6, problemas: [] });
    expect(simularBolao({ modalidade: 'mais-milionaria', numeros: 12, trevos: 6, jogos: 2, cotas: 100 }).problemas).toContain('bolão máximo de R$ 83.160');
  });
  it('Mega: bolão mínimo R$ 18 e cota mínima R$ 7; Lotofácil: cotas e jogos pelo nº de números', () => {
    expect(simularBolao({ modalidade: 'mega-sena', numeros: 6, jogos: 1, cotas: 2 }).problemas).toEqual(expect.arrayContaining(['bolão mínimo de R$ 18,00', 'cota mínima de R$ 7,00']));
    expect(simularBolao({ modalidade: 'mega-sena', numeros: 6, jogos: 3, cotas: 2 }).problemas).toEqual([]);
    expect(simularBolao({ modalidade: 'lotofacil', numeros: 15, jogos: 10, cotas: 8 }).problemas).toContain('no máximo 7 cotas com 15 números');
    expect(simularBolao({ modalidade: 'lotofacil', numeros: 20, jogos: 5, cotas: 100 }).problemas).toContain('no máximo 4 jogos por bolão');
  });
  it('Loteca: bolão a partir de 3 duplos (8 apostas = R$ 16); resíduo na última cota', () => {
    expect(simularBolao({ modalidade: 'loteca', duplos: 3, jogos: 1, cotas: 4 })).toMatchObject({ valorBolao: 16, valorCota: 4, problemas: [] });
    expect(simularBolao({ modalidade: 'loteca', duplos: 1, jogos: 1, cotas: 2 }).problemas).toContain('bolão mínimo de R$ 16,00');
    const r = simularBolao({ modalidade: 'quina', numeros: 7, jogos: 1, cotas: 4 }); // 21 x 3 = R$ 63 / 4
    expect([r.valorCota, r.valorUltimaCota]).toEqual([15.75, 15.75]);
    const q = simularBolao({ modalidade: 'quina', numeros: 6, jogos: 5, cotas: 7 }); // R$ 90 / 7
    expect(q.valorCota).toBe(12.85);
    expect(q.valorUltimaCota).toBe(12.9);
  });
  it('lucro esperado com venda parcial e break-even', () => {
    const s = simularBolao({ modalidade: 'dupla-sena', numeros: 9, jogos: 1, cotas: 50, vendaEsperada: 0.5 });
    expect(s.lucroEsperado).toBeLessThan(0);
    expect(s.breakEven.cotas).toBeGreaterThan(30);
    expect(s.breakEven.fracao).toBeCloseTo(0.677, 3);
  });
});

describe('Loteca: probabilidades e melhor marcação', () => {
  it('odds sem a margem da casa; modelo de força sem odds', () => {
    const p = probabilidadesLoteca({ time1: 'A', time2: 'B', odds: [2, 3.5, 4] });
    const soma = 1 / 2 + 1 / 3.5 + 1 / 4;
    expect(p['1']).toBeCloseTo(0.5 / soma, 10);
    expect(p['1'] + p.X + p['2']).toBeCloseTo(1, 12);
    expect(p.margem).toBeCloseTo(soma - 1, 4);
    const neutro = probabilidadesLoteca({ time1: 'A', time2: 'B', neutro: true });
    expect(neutro['1']).toBeCloseTo(neutro['2'], 12);
    expect(neutro.X).toBeCloseTo(0.28, 12);
    const forte = probabilidadesLoteca({ time1: 'A', time2: 'B', elo1: 1700, elo2: 1400 });
    expect(forte['1']).toBeGreaterThan(0.6);
    expect(forte.X).toBeLessThan(neutro.X);
  });
  it('a programação dinâmica acha o mesmo ótimo que a força bruta', () => {
    const probs: ProbabilidadesJogo[] = [
      [0.7, 0.2, 0.1], [0.4, 0.35, 0.25], [0.34, 0.33, 0.33], [0.5, 0.3, 0.2], [0.2, 0.3, 0.5], [0.45, 0.45, 0.1],
    ].map(([a, b, c]) => ({ '1': a!, X: b!, '2': c!, fonte: 'odds' as const }));
    const melhor = melhorMarcacao(probs, 2, 1);
    let bruto = 0;
    const tipos = ['s', 'd', 't'] as const;
    const rec = (i: number, d: number, t: number, p: number) => {
      if (i === probs.length) {
        if (d === 2 && t === 1) bruto = Math.max(bruto, p);
        return;
      }
      const o = Object.values({ a: probs[i]!['1'], b: probs[i]!.X, c: probs[i]!['2'] }).sort((x, y) => y - x);
      for (const k of tipos) rec(i + 1, d + (k === 'd' ? 1 : 0), t + (k === 't' ? 1 : 0), p * (k === 't' ? 1 : k === 'd' ? o[0]! + o[1]! : o[0]!));
    };
    rec(0, 0, 0, 1);
    expect(melhor.chance14).toBeCloseTo(bruto, 12);
    // o triplo vai para o jogo mais incerto
    expect(melhor.jogos[2]!.tipo).toBe('triplo');
  });
  it('tabela de marcações = combinações e preços do volante oficial; 1 duplo uniforme = 1 em 2.391.485', () => {
    const uniforme = Array.from({ length: 14 }, () => ({ '1': 1 / 3, X: 1 / 3, '2': 1 / 3, fonte: 'modelo' as const }));
    const t = tabelaDeMarcacoes(uniforme);
    expect(t).toHaveLength(COMBINACOES_LOTECA.length);
    expect(t[0]).toMatchObject({ duplos: 1, triplos: 0, apostas: 2, valor: 4 });
    expect(Math.round(1 / t[0]!.chance14)).toBe(2_391_485);
    const max = t.find((m) => m.duplos === 5 && m.triplos === 3)!;
    expect([max.apostas, max.valor]).toEqual([864, 1728]);
    expect(max.jogos.filter((j) => j.tipo === 'triplo')).toHaveLength(3);
    expect(max.chance13).toBeGreaterThan(max.chance14);
  });
});

describe('calendário de sorteios', () => {
  it('domingo às 11h (abertura 11:45); sábado avisa a Loteca; 31/12 é a Mega da Virada', () => {
    const dom = sorteiosDoDia('2026-11-22');
    expect(dom.sorteios.map((s) => s.modalidade).sort()).toEqual(['dia-de-sorte', 'mega-sena', 'quina', 'timemania']);
    expect(dom.sorteios[0]!.sorteioEm).toEqual(horarioSP(2026, 11, 22, 11, 0));
    expect(dom.sorteios[0]!.aberturaEm).toEqual(horarioSP(2026, 11, 22, 11, 45));
    const sab = sorteiosDoDia('2026-11-21');
    expect(sab.avisos).toContain('Loteca: apostas até 14h');
    const virada = sorteiosDoDia('2026-12-31');
    const mega = virada.sorteios.filter((s) => s.modalidade === 'mega-sena');
    expect(mega).toHaveLength(1);
    expect(mega[0]).toMatchObject({ especial: 'Mega da Virada', sorteioEm: horarioSP(2026, 12, 31, 20, 0) });
    expect(calendarioDoMes(2026, 2)).toHaveLength(28);
    expect(calendarioDoMes(2026, 11)[0]!.dia).toBe('2026-11-01');
  });
});
