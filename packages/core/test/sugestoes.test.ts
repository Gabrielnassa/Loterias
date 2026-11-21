import { describe, expect, it } from 'vitest';
import type { LotericaRef } from '../dominio/tipos';
import type { BolaoHistorico } from '../mercado/estatisticas';
import { gerarHistoricoSimulado } from '../simulacao/historico';
import { historicoDeBoloesSimulado } from '../simulacao/mercado-simulado';
import { amostrasParecidas, avaliarOpcao, dividirFranquia, opcaoBolao, otimizarFormato, type OpcaoBolao } from '../sugestoes/otimizador';
import { diaSP, horarioSP, somarDias } from '../tempo/fuso';

const L = (uf: string): LotericaRef => ({ codigoCaixa: uf === 'SP' ? '1' : '2', nome: 'X', cidade: 'C', uf });
function hb(o: Partial<BolaoHistorico> & { vend: number; cotas: number; valor: number; uf?: string }): BolaoHistorico {
  return {
    id: Math.random().toString(36), loterica: L(o.uf ?? 'SP'), modalidade: o.modalidade ?? 'mega-sena', concurso: 1, jogos: o.jogos ?? 1, dezenas: o.dezenas ?? 8,
    cotasTotal: o.cotas, valorCotaBase: o.valor, entrouEm: o.entrouEm ?? horarioSP(2026, 11, 10, 21, 45), esgotouEm: null, disponiveis: o.cotas - o.vend, encerrado: o.encerrado ?? true,
  };
}

describe('lucro esperado e risco de uma opção', () => {
  const op: OpcaoBolao = { modalidade: 'mega-sena', jogos: 1, dezenas: 8, cotas: 10, valorCota: 20, valorBolao: 200, formato: '1J-8D-10C' };
  it('tarifa x cotas vendidas + comissão − sobra, amostra por amostra', () => {
    // vende tudo: 10 x 7,00 + 8,61% x 200 = 87,22; metade: 35 + 17,22 − 100 = −47,78; nada: −200 (sem comissão)
    const a = avaliarOpcao(op, [1, 0.5, 0], 'formato')!;
    expect(a.lucroEsperado).toBe(Math.round(((87.22 - 47.78 - 200) / 3) * 100) / 100);
    expect(a.tarifaEsperada).toBe(35);
    expect(a.chanceDePrejuizo).toBeCloseTo(2 / 3);
    expect(a.risco).toBe('alto');
    expect(a.lucroP10).toBe(-169.56);
    expect(a.chanceDeEsgotar).toBeCloseTo(1 / 3);
    expect(avaliarOpcao(op, [1, 1, 0.9, 1], 'formato')!.risco).toBe('baixo');
    expect(avaliarOpcao(op, [], 'formato')).toBeNull();
  });
  it('valor da cota = custo dos jogos / cotas', () => {
    // Mega com 8 números = 28 apostas de R$ 6 = R$ 168; 2 jogos = R$ 336; 24 cotas = R$ 14,00
    expect(opcaoBolao('mega-sena', 2, 8, 24)).toMatchObject({ valorBolao: 336, valorCota: 14, formato: '2J-8D-24C' });
    expect(opcaoBolao('loteca', 1, 14, 10)).toBeNull();
  });
});

describe('amostras parecidas', () => {
  it('mesmo formato na UF; senão faixa de preço e cotas parecidas; senão o Brasil', () => {
    const op = opcaoBolao('mega-sena', 1, 8, 10)!; // cota R$ 16,80
    const iguais = Array.from({ length: 12 }, () => hb({ cotas: 10, valor: 16.8, vend: 7 }));
    expect(amostrasParecidas(iguais, op, { uf: 'SP' })).toMatchObject({ base: 'formato' });
    const parecidos = Array.from({ length: 12 }, () => hb({ cotas: 15, valor: 12, vend: 9, jogos: 2 }));
    expect(amostrasParecidas(parecidos, op, { uf: 'SP' })).toMatchObject({ base: 'parecidos' });
    const outraUf = Array.from({ length: 5 }, () => hb({ cotas: 15, valor: 12, vend: 9, uf: 'RJ' }));
    const r = amostrasParecidas(outraUf, op, { uf: 'SP' });
    expect(r.base).toBe('brasil');
    expect(r.fracoes).toEqual(Array(5).fill(0.6));
    // em aberto não conta (ainda não se sabe a sobra)
    expect(amostrasParecidas([hb({ cotas: 10, valor: 16.8, vend: 1, encerrado: false })], op, {}).fracoes).toEqual([]);
  });
});

describe('otimizador e franquia com o histórico simulado', () => {
  const agora = horarioSP(2026, 11, 21, 12, 0);
  const h = gerarHistoricoSimulado({ ate: agora, semanas: 4, nLotericas: 200 });
  const hist = historicoDeBoloesSimulado(h, agora);
  const desde = somarDias(diaSP(agora), -21);

  it('ordena formatos por lucro por R$ de franquia e respeita o valor máximo', () => {
    const r = otimizarFormato(hist, { modalidade: 'lotofacil', uf: 'SP', desde, limite: 50 });
    expect(r.length).toBeGreaterThan(3);
    for (let i = 1; i < r.length; i++) expect(r[i - 1]!.lucroPorReal).toBeGreaterThanOrEqual(r[i]!.lucroPorReal);
    for (const a of r) expect(a.valorCota).toBeCloseTo(a.valorBolao / a.cotas, 1);
    const baratos = otimizarFormato(hist, { modalidade: 'lotofacil', uf: 'SP', desde, valorMaximo: 300 });
    expect(baratos.every((a) => a.valorBolao <= 300)).toBe(true);
  });
  it('divide a franquia de amanhã: não passa do limite nem de 25% da procura por loteria', () => {
    const dia = somarDias(diaSP(agora), 1); // domingo
    const s = dividirFranquia(hist, { dia, uf: 'SP', limite: 8000, desde });
    expect(s.usado).toBeLessThanOrEqual(8000);
    expect(s.sobraDaFranquia).toBeCloseTo(8000 - s.usado, 2);
    expect(s.linhas.map((l) => l.modalidade)).toEqual(['lotofacil']); // domingo simulado só tem Lotofácil
    const sexta = dividirFranquia(hist, { dia: '2026-11-27', uf: 'SP', limite: 8000, desde });
    expect(sexta.linhas.length).toBe(2);
    for (const l of [...s.linhas, ...sexta.linhas]) {
      if (!l.recomendacao) continue;
      expect(l.valorSugerido).toBeCloseTo(l.boloes * l.recomendacao.valorBolao, 2);
      expect(l.valorSugerido).toBeLessThanOrEqual(l.procuraPorDia * 0.25 + 1e-6);
      expect(l.motivo).toMatch(/a UF vendeu/);
    }
    expect(sexta.lucroEsperado).toBeCloseTo(sexta.linhas.reduce((x, l) => x + l.lucroEsperado, 0), 2);
  });
});
