import { describe, expect, it } from 'vitest';
import { breakEvenPorConcurso, financeiroDoBolao, resumoFinanceiro, type BolaoMinha } from '../minha/financeiro-mkp';
import { posicaoNaAbertura } from '../minha/posicao';
import { gerarHistoricoSimulado } from '../simulacao';
import { horarioSP } from '../tempo/fuso';

const base: BolaoMinha = {
  id: 'b1', modalidade: 'timemania', concurso: 2300, inseridoEm: horarioSP(2026, 11, 20, 21, 46), diaSorteio: '2026-11-21',
  cotasTotal: 8, cotasDigitais: 8, cotasDisponiveis: 0, valorCotaBase: 5.25, sobraFinal: null, estornado: false,
};

describe('Bolões e Financeiro MKP', () => {
  it('internet x balcão: o que não é digital foi impresso e conta como vendido (gera tarifa, sem sobra)', () => {
    const f = financeiroDoBolao({ ...base, cotasTotal: 10, cotasDigitais: 6, cotasDisponiveis: 2, valorCotaBase: 4.32, sobraFinal: 2 });
    expect(f).toMatchObject({ vendidasInternet: 4, vendidasBalcao: 4, cotasSobradas: 2, encerrado: true });
    expect(f.tarifa).toBe(12.08); // 8 x 1,51
    expect(f.recebidoBalcao).toBe(23.32); // 4 x 5,83
  });

  it('break-even dos bolões à venda por concurso (caso da Timemania: 3 cotas)', () => {
    const be = breakEvenPorConcurso([
      { ...base, id: 'a', cotasDisponiveis: 0 },
      { ...base, id: 'b', cotasDisponiveis: 8 },
      { ...base, id: 'c', concurso: 2299, sobraFinal: 2, cotasDisponiveis: 2 }, // encerrado: fora
    ]);
    expect(be).toHaveLength(1);
    expect(be[0]).toMatchObject({ modalidade: 'timemania', concurso: 2300 });
    expect(be[0]!.breakEven.cotasFaltando).toBe(3);
  });

  it('resumo: total, dia a dia, por loteria, maiores lucros e prejuízos; estornado fora', () => {
    const r = resumoFinanceiro([
      { ...base, id: 'lucro', sobraFinal: 0 },
      { ...base, id: 'prejuizo', sobraFinal: 8, cotasDisponiveis: 8 },
      { ...base, id: 'estornado', sobraFinal: 8, cotasDisponiveis: 8, estornado: true },
      { ...base, id: 'outro-dia', diaSorteio: '2026-11-19', modalidade: 'quina', sobraFinal: 1, cotasDisponiveis: 1 },
    ]);
    expect(r.maioresLucros.map((l) => l.id)).toEqual(['lucro', 'outro-dia']); // 8/8 vendidas lucra mais que 7/8
    expect(r.maioresPrejuizos.map((l) => l.id)).toEqual(['prejuizo']);
    expect(r.porDia.map((d) => d.dia)).toEqual(['2026-11-21', '2026-11-19']);
    expect(r.porModalidade.map((m) => m.modalidade).sort()).toEqual(['quina', 'timemania']);
    expect(r.total.lucro).toBe(Math.round(r.boloes.reduce((s, b) => s + b.lucro, 0) * 100) / 100);
    expect(r.boloes.find((b) => b.id === 'estornado')!.lucro).toBe(0);
  });
});

describe('Posição na abertura (7/30/90 dias)', () => {
  const ate = horarioSP(2026, 11, 21, 12, 0);
  const h = gerarHistoricoSimulado({ ate, semanas: 13, nLotericas: 200 });
  const mapa = new Map(h.lotericas.map((l) => [l.codigoCaixa, l]));
  const minha = h.lotericas[0]!;

  it.each([7, 30, 90])('%i dias: calendário com um dia por dia e resumo coerente', (dias) => {
    const p = posicaoNaAbertura(minha, h.aberturas, h.participacoes, mapa, { dias, ate });
    expect(p.calendario).toHaveLength(dias);
    expect(p.calendario.at(-1)!.dia).toBe('2026-11-21');
    expect(p.porDiaSemana.reduce((s, d) => s + d.minhas, 0)).toBe(p.resumo.minhas);
    expect(p.resumo.rapidas + p.resumo.medias + p.resumo.lentas).toBe(p.calendario.filter((c) => c.participou).length);
    for (const c of p.calendario.filter((x) => x.participou)) expect(c.paginaUf).toBe(Math.ceil(c.posUf! / 30));
    expect(p.resumo.paginaMediaUfOutras).not.toBeNull();
  });
});
