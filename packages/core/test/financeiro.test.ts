import { describe, expect, it } from 'vitest';
import { formatarCodigoBolao, lerCodigoBolao } from '../dominio/codigo-bolao';
import { combinacoes, custoJogo } from '../dominio/modalidades';
import { breakEvenFracao, cotasParaEmpatar, resultadoBolao, somarResultados } from '../regras/financeiro';
import { franquiaDisponivel, franquiaUsada } from '../regras/franquia';
import { horarioSP } from '../tempo/fuso';

// 6J-17D-40C de Lotofácil: 6 x C(17,15)=136 x R$ 3,50 = R$ 2.856,00 => cota base R$ 71,40
const BASE = { cotasTotal: 40, valorCotaBase: 71.4 };

describe('código do bolão', () => {
  it('formata e lê 6J-17D-40C', () => {
    expect(formatarCodigoBolao({ jogos: 6, dezenas: 17, cotas: 40 })).toBe('6J-17D-40C');
    expect(lerCodigoBolao('6J-17D-40C')).toEqual({ jogos: 6, dezenas: 17, cotas: 40 });
    expect(lerCodigoBolao(' 10j - 16d - 20c ')).toEqual({ jogos: 10, dezenas: 16, cotas: 20 });
    expect(lerCodigoBolao('6J-17D')).toBeNull();
    expect(lerCodigoBolao('0J-17D-40C')).toBeNull();
  });

  it('custo combinatório de referência', () => {
    expect(combinacoes(17, 15)).toBe(136);
    expect(combinacoes(8, 6)).toBe(28);
    expect(custoJogo('lotofacil', 17)).toBe(476);
    expect(custoJogo('mega-sena', 6)).toBe(6);
    expect(custoJogo('lotomania', 50)).toBeUndefined();
  });
});

describe('financeiro do bolão', () => {
  it('tarifa, comissão, sobra e lucro (30 de 40 cotas pela internet)', () => {
    const r = resultadoBolao({ ...BASE, cotasVendidasInternet: 30 });
    expect(r.apostas).toBe(2856);
    expect(r.tarifa).toBe(749.7); // 35% x 71,40 x 30
    expect(r.comissao).toBe(245.9); // 8,61% x 2.856
    expect(r.sobra).toBe(714); // 10 x 71,40
    expect(r.lucro).toBe(281.6); // 749,70 − 714 + 245,90
    expect(r.recebidoInternet).toBe(2891.7); // 30 x 71,40 x 1,35
    expect(r.cotasSobradas).toBe(10);
  });

  it('sem nenhuma cota vendida não há comissão: prejuízo = valor do bolão', () => {
    const r = resultadoBolao({ ...BASE, cotasVendidasInternet: 0 });
    expect(r.comissao).toBe(0);
    expect(r.tarifa).toBe(0);
    expect(r.lucro).toBe(-2856);
  });

  it('uma cota vendida já libera a comissão sobre o bolão inteiro', () => {
    const r = resultadoBolao({ ...BASE, cotasVendidasInternet: 1 });
    expect(r.comissao).toBe(245.9);
    expect(r.lucro).toBe(-2513.71); // 24,99 − 2.784,60 + 245,90
  });

  it('balcão conta como vendida (sem sobra) e também gera tarifa de 35%', () => {
    const r = resultadoBolao({ ...BASE, cotasVendidasInternet: 10, cotasVendidasBalcao: 30 });
    expect(r.cotasSobradas).toBe(0);
    expect(r.sobra).toBe(0);
    expect(r.tarifa).toBe(999.6); // 40 x 24,99
    expect(r.lucro).toBe(1245.5); // 999,60 − 0 + 245,90
    expect(r.recebidoInternet).toBe(963.9); // 10 x 96,39
    expect(r.recebidoBalcao).toBe(2891.7); // 30 x 96,39
  });

  it('impressos do oLoterico: R$ 29,15 vendidos geraram R$ 7,55 de tarifa (5 cotas de R$ 4,32)', () => {
    const r = resultadoBolao({ cotasTotal: 5, valorCotaBase: 4.32, cotasVendidasInternet: 0, cotasVendidasBalcao: 5 });
    expect(r.recebidoBalcao).toBe(29.15);
    expect(r.tarifa).toBe(7.55);
    expect(r.sobra).toBe(0);
  });

  it('balcão sozinho também libera a comissão', () => {
    expect(resultadoBolao({ ...BASE, cotasVendidasInternet: 0, cotasVendidasBalcao: 1 }).comissao).toBe(245.9);
  });

  it('estornado zera tudo', () => {
    const r = resultadoBolao({ ...BASE, cotasVendidasInternet: 30, estornado: true });
    expect(r).toMatchObject({ tarifa: 0, comissao: 0, sobra: 0, lucro: 0 });
  });

  it('rejeita entradas impossíveis', () => {
    expect(() => resultadoBolao({ ...BASE, cotasVendidasInternet: 41 })).toThrow(RangeError);
    expect(() => resultadoBolao({ ...BASE, cotasVendidasInternet: 30, cotasVendidasBalcao: 11 })).toThrow(RangeError);
    expect(() => resultadoBolao({ cotasTotal: 0, valorCotaBase: 10, cotasVendidasInternet: 0 })).toThrow(RangeError);
  });

  it('break-even pela fórmula de lucro: (1 − 8,61%) / 1,35 ≈ 67,70%', () => {
    expect(breakEvenFracao()).toBeCloseTo(0.676963, 6);
    expect(cotasParaEmpatar(40, 71.4)).toBe(28);
    const r27 = resultadoBolao({ ...BASE, cotasVendidasInternet: 27 });
    const r28 = resultadoBolao({ ...BASE, cotasVendidasInternet: 28 });
    expect(r27.lucro).toBeLessThan(0);
    expect(r28.lucro).toBeGreaterThanOrEqual(0);
  });

  it('soma de resultados', () => {
    const a = resultadoBolao({ ...BASE, cotasVendidasInternet: 30 });
    const b = resultadoBolao({ ...BASE, cotasVendidasInternet: 0 });
    const s = somarResultados([a, b]);
    expect(s.lucro).toBe(Math.round((281.6 - 2856) * 100) / 100);
    expect(s.apostas).toBe(5712);
  });
});

describe('franquia diária (05:00 a 23:00, valor sem tarifa)', () => {
  const dia = '2026-11-16';
  const b = (h: number, m: number, s: number, valor: number, estornado = false) => ({
    inseridoEm: horarioSP(2026, 11, 16, h, m, s),
    cotasTotal: 10,
    valorCotaBase: valor / 10,
    estornado,
  });

  it('conta só o que entrou na janela [05:00, 23:00)', () => {
    const boloes = [b(4, 59, 59, 1000), b(5, 0, 0, 200), b(12, 0, 0, 300), b(22, 59, 59, 400), b(23, 0, 0, 5000)];
    expect(franquiaUsada(boloes, dia)).toBe(900);
  });

  it('estornados NÃO contam por padrão (dúvida aberta); opção para contar', () => {
    const boloes = [b(10, 0, 0, 500), b(11, 0, 0, 700, true)];
    expect(franquiaUsada(boloes, dia)).toBe(500);
    expect(franquiaUsada(boloes, dia, { contarEstornados: true })).toBe(1200);
  });

  it('bolão de outro dia não entra', () => {
    expect(franquiaUsada([{ inseridoEm: horarioSP(2026, 11, 17, 10, 0), cotasTotal: 1, valorCotaBase: 100 }], dia)).toBe(0);
  });

  it('disponível nunca fica negativo', () => {
    expect(franquiaDisponivel(8000, 7500.5)).toBe(499.5);
    expect(franquiaDisponivel(8000, 9000)).toBe(0);
  });
});

describe('tarifa observada no portal (21/11/2026)', () => {
  it('cota de R$ 20,16: tarifa R$ 7,05 (truncada), cota com tarifa R$ 27,21', async () => {
    const { tarifaPorCota, valorDasApostas } = await import('../regras/financeiro');
    expect(tarifaPorCota(20.16)).toBe(7.05);
    expect(tarifaPorCota(71.4)).toBe(24.99);
    expect(Math.round((20.16 + tarifaPorCota(20.16)) * 100) / 100).toBe(27.21);
    // Mega-Sena 4 jogos de 9 dezenas: 4 x C(9,6)=84 x R$ 6 = R$ 2.016 / 100 cotas = R$ 20,16
    expect(valorDasApostas({ cotasTotal: 100, valorCotaBase: 20.16 })).toBe(2016);
    expect(valorDasApostas({ cotasTotal: 3, valorCotaBase: 33.33, contemResiduo: true, valorUltimaCotaBase: 33.34 })).toBe(100);
    const r = resultadoBolao({ cotasTotal: 100, valorCotaBase: 20.16, cotasVendidasInternet: 3 });
    expect(r.tarifa).toBe(21.15); // 3 x 7,05 (e não 3 x 7,056 = 21,17)
    expect(r.recebidoInternet).toBe(81.63); // 3 x 27,21
    expect(resultadoBolao({ cotasTotal: 100, valorCotaBase: 20.16, cotasVendidasInternet: 3, tarifaPorCotaFonte: 7.05 }).tarifa).toBe(21.15);
  });
});

describe('break-even em cotas e % (grupo de bolões, como no oLoterico)', () => {
  it('caso real: 2 bolões de Timemania de 8 cotas, um esgotado e outro 0/8 => faltam 3 cotas', async () => {
    const { breakEvenGrupo } = await import('../regras/financeiro');
    const bolao = { cotasTotal: 8, valorCotaBase: 5.25 }; // 12 jogos x R$ 3,50 / 8 cotas
    const be = breakEvenGrupo([
      { ...bolao, cotasVendidasInternet: 8 },
      { ...bolao, cotasVendidasInternet: 0 },
    ]);
    expect(be.cotasFaltando).toBe(3);
    expect(be.pctNecessario).toBeCloseTo(11 / 16);
    expect(be.lucroAtual).toBeLessThan(0);
    // o mesmo resultado para outros valores de cota (a conta é proporcional)
    for (const v of [2.1, 7, 13.13]) {
      expect(breakEvenGrupo([{ cotasTotal: 8, valorCotaBase: v, cotasVendidasInternet: 8 }, { cotasTotal: 8, valorCotaBase: v, cotasVendidasInternet: 0 }]).cotasFaltando).toBe(3);
    }
  });

  it('um bolão sozinho: 28 de 40 (≈ 70%), já empatado = 0, estornado não conta', async () => {
    const { breakEvenGrupo } = await import('../regras/financeiro');
    expect(breakEvenGrupo([{ ...BASE, cotasVendidasInternet: 0 }]).cotasFaltando).toBe(28);
    expect(breakEvenGrupo([{ ...BASE, cotasVendidasInternet: 10 }]).cotasFaltando).toBe(18);
    const ok = breakEvenGrupo([{ ...BASE, cotasVendidasInternet: 30 }]);
    expect(ok.cotasFaltando).toBe(0);
    expect(ok.pctNecessario).toBe(0.75);
    expect(breakEvenGrupo([{ ...BASE, cotasVendidasInternet: 0, estornado: true }]).cotasTotal).toBe(0);
  });
});
