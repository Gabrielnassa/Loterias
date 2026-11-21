import { describe, expect, it } from 'vitest';
import type { LotericaRef } from '../dominio/tipos';
import { fichaLoterica, panoramaNacional, topLotericas } from '../mercado/estatisticas';
import { resumoFilasMercado } from '../mercado/filas';
import { disponiveisEm, faixaDePreco, retratoMercado, serieMercado, type BolaoMercado } from '../mercado/vitrine';
import { gerarAberturaSimulada, vitrineEm } from '../simulacao/abertura-simulada';
import { gerarHistoricoSimulado } from '../simulacao/historico';
import { concursosAVendaSimulados, historicoDeBoloesSimulado, megaDaViradaSimulada, vitrineSimulada } from '../simulacao/mercado-simulado';
import { diaSP, horarioSP, somarDias } from '../tempo/fuso';

const L = (codigo: string, uf = 'SP', cidade = 'São Paulo'): LotericaRef => ({ codigoCaixa: codigo, nome: `Lotérica ${codigo}`, cidade, uf });
const T0 = horarioSP(2026, 11, 20, 21, 45).getTime();
const min = (m: number) => T0 + m * 60_000;

function bolao(id: string, l: LotericaRef, fila: number, entra: number, cotas: number, valor: number, mudancas: [number, number][] = [], saiuEm: number | null = null): BolaoMercado {
  return { id, loterica: l, modalidade: 'mega-sena', concurso: 3089, jogos: 1, dezenas: 8, cotasTotal: cotas, valorCotaBase: valor, fila, entrouEm: min(entra), disponiveisNaEntrada: cotas, mudancas: mudancas.map(([m, d]) => [min(m), d]), saiuEm: saiuEm === null ? null : min(saiuEm) };
}

const A = L('1');
const B = L('2');
const C = L('3', 'RJ', 'Rio de Janeiro');
const BOLOES = [
  bolao('a1', A, 1, 0, 10, 20, [[2, 8], [10, 0]]), // esgota aos 10 min
  bolao('b1', B, 1, 1, 20, 5, [[3, 19], [7, 15]]),
  bolao('a2', A, 2, 4, 5, 100, [], 12), // some aos 12 min (conta como vendido)
  bolao('c1', C, 1, 6, 40, 12.5, [[8, 30]]),
];

describe('retrato da vitrine num instante', () => {
  it('disponíveis por instante, com saída', () => {
    const a2 = BOLOES[2]!;
    expect(disponiveisEm(a2, min(3))).toBeNull();
    expect(disponiveisEm(a2, min(5))).toBe(5);
    expect(disponiveisEm(a2, min(12))).toBe(0);
    expect(disponiveisEm(BOLOES[0]!, min(2))).toBe(8);
  });
  it('conta bolões, cotas, lotéricas, R$, páginas, filas, ticket, delta 5 min e ritmo', () => {
    const r = retratoMercado(BOLOES, min(9));
    // a1: 8 x 20; b1: 15 x 5; a2: 5 x 100; c1: 30 x 12,5
    expect(r).toMatchObject({ boloes: 4, cotas: 58, lotericas: 3, valor: 160 + 75 + 500 + 375, paginas: 1, filas: 2, inseridos: 4, esgotados: 0 });
    expect(r.ticketMedio).toBe(Math.round((1110 / 58) * 100) / 100);
    expect(r.cotasVendidas).toBe(2 + 5 + 10);
    // últimos 5 min (4, 9]: b1 vendeu 4 (19 -> 15), c1 entrou e vendeu 10
    expect(r.delta5min).toEqual({ cotasVendidas: 14, valorVendido: 4 * 5 + 10 * 12.5, novos: 1, boloes: 1 }); // a2 entrou em 4 min, no limite: não é "novo"
    expect(r.maiores.map((m) => m.id)).toEqual(['a2', 'c1', 'a1', 'b1']);
    const depois = retratoMercado(BOLOES, min(13));
    expect(depois).toMatchObject({ boloes: 2, esgotados: 2, pctEsgotado: 0.5 });
  });
  it('filtro por UF e cidade; nada à venda depois do fechamento', () => {
    expect(retratoMercado(BOLOES, min(9), { filtro: { uf: 'RJ' } })).toMatchObject({ boloes: 1, lotericas: 1 });
    expect(retratoMercado(BOLOES, min(9), { filtro: { uf: 'sp', cidade: 'sao paulo' } }).boloes).toBe(3);
    const fechado = retratoMercado(BOLOES, min(20), { fechaEm: min(11) });
    expect(fechado).toMatchObject({ boloes: 0, cotas: 0, valor: 0, inseridos: 4 });
    expect(fechado.cotasVendidas).toBe(10 + 5 + 0 + 10); // a2 só sumiu aos 12, depois do fechamento: sobrou
  });
});

describe('série minuto a minuto e hora a hora', () => {
  it('a varredura de eventos bate com o retrato em cada minuto', () => {
    const serie = serieMercado(BOLOES, { de: T0, ate: min(15), passoMs: 60_000 });
    expect(serie).toHaveLength(15);
    for (const p of serie) {
      const r = retratoMercado(BOLOES, p.t.getTime() - 1);
      expect([p.boloes, p.cotas, p.valor], p.t.toISOString()).toEqual([r.boloes, r.cotas, r.valor]);
    }
    expect(serie.reduce((s, p) => s + p.cotasVendidas, 0)).toBe(retratoMercado(BOLOES, min(15)).cotasVendidas);
    expect(serie.reduce((s, p) => s + p.novos, 0)).toBe(4);
    expect(serie.reduce((s, p) => s + p.esgotados, 0)).toBe(2);
  });
  it('fechamento tira o que sobrou sem contar como venda', () => {
    const serie = serieMercado(BOLOES, { de: T0, ate: min(20), passoMs: 5 * 60_000, fechaEm: min(11) });
    expect(serie.at(-1)).toMatchObject({ boloes: 0, cotas: 0 });
    expect(serie.reduce((s, p) => s + p.cotasVendidas, 0)).toBe(retratoMercado(BOLOES, min(20), { fechaEm: min(11) }).cotasVendidas);
  });
  it('abertura simulada de 300 bolões: retrato = vitrine verdadeira, série = retrato', () => {
    const sim = gerarAberturaSimulada({ semente: 7, t0: new Date(T0), nBoloes: 300 });
    for (const m of [5, 30, 90, 600]) {
      const t = min(m);
      const v = vitrineSimulada(sim, t);
      const r = retratoMercado(v, t, { fechaEm: sim.fechaEm });
      const verdade = vitrineEm(sim, new Date(t));
      expect(r.boloes).toBe(verdade.length);
      expect(r.cotas).toBe(verdade.reduce((s, b) => s + b.cotasDisponiveis, 0));
      const serie = serieMercado(v, { de: T0 - 60_000, ate: t + 1, passoMs: 60_000, fechaEm: sim.fechaEm });
      expect(serie.at(-1)!.boloes).toBe(r.boloes);
      expect(serie.reduce((s, p) => s + p.cotasVendidas, 0)).toBe(r.cotasVendidas);
    }
  });
});

describe('filas', () => {
  it('páginas de cada fila na ordem da vitrine (fila, entrada) e totais', () => {
    const sim = gerarAberturaSimulada({ semente: 11, t0: new Date(T0), nBoloes: 400 });
    const t = min(45);
    const v = vitrineSimulada(sim, t);
    const f = resumoFilasMercado(v, t, { fechaEm: sim.fechaEm });
    const r = retratoMercado(v, t, { fechaEm: sim.fechaEm });
    expect(f.porFila[0]!.fila).toBe(1);
    expect(f.porFila[0]!.paginaDe).toBe(1);
    expect(f.porFila.reduce((s, x) => s + x.aVenda, 0)).toBe(r.boloes);
    expect(f.porFila.reduce((s, x) => s + x.boloes, 0)).toBe(f.boloes);
    expect(f.paginas).toBe(r.paginas);
    // filas seguidas na vitrine: a 2ª começa na página em que a 1ª termina (ou na seguinte)
    const [f1, f2] = f.porFila;
    if (f1?.paginaAte && f2?.paginaDe) expect(f2.paginaDe - f1.paginaAte).toBeLessThanOrEqual(1);
    expect(f.maiores[0]!.valorTotal).toBeGreaterThanOrEqual(f.maiores.at(-1)!.valorTotal);
    expect(f.novosPorDia.reduce((s, d) => s + d.novos, 0)).toBe(f.boloes);
  });
  it('vendido por faixa de preço e "sobra N vezes mais"', () => {
    const v = [
      bolao('x1', A, 1, 0, 10, 8, [[1, 0]]), // até R$ 10: vende tudo... e outro sobra metade
      bolao('x2', B, 1, 0, 10, 10, [[1, 5]]),
      bolao('y1', C, 1, 0, 10, 60, [[1, 9]]),
    ];
    const f = resumoFilasMercado(v, min(5));
    const ate10 = f.porFaixaDePreco.find((x) => x.faixa === 'até R$ 10')!;
    const de50 = f.porFaixaDePreco.find((x) => x.faixa === 'R$ 50-100')!;
    expect(ate10).toMatchObject({ boloes: 2, pctVendido: 15 / 20, sobraRelativa: 1 });
    expect(de50).toMatchObject({ boloes: 1, pctVendido: 0.1, sobraRelativa: 3.6 }); // sobra 90% x 25%
    expect(faixaDePreco(10)).toBe('até R$ 10');
    expect(faixaDePreco(10.01)).toBe('R$ 10-20');
  });
});

describe('estatísticas com o histórico simulado', () => {
  const agora = horarioSP(2026, 11, 21, 12, 0);
  const h = gerarHistoricoSimulado({ ate: agora, semanas: 2, nLotericas: 60 });
  const todos = historicoDeBoloesSimulado(h, agora);

  it('concursos à venda agora e Mega da Virada', () => {
    const av = concursosAVendaSimulados(h, agora);
    expect(av.map((c) => c.modalidade).sort()).toEqual(['lotofacil', 'quina']); // sábado (21/11) não tem Mega no calendário simulado de sexta
    for (const c of av) expect(c.abreEm.getTime()).toBeLessThanOrEqual(agora.getTime());
    const virada = megaDaViradaSimulada(h, agora);
    expect(virada.especial).toBe(true);
    expect(diaSP(virada.sorteioEm!)).toBe('2026-12-31');
    const r = retratoMercado(vitrineSimulada(virada.sim, agora), agora, { fechaEm: virada.fechaEm });
    expect(r.boloes).toBeGreaterThan(50);
    expect(virada.sim.boloes.some((b) => b.chegadaEm.getTime() > agora.getTime())).toBe(true); // ainda vai receber bolões
  });
  it('ficha da lotérica: totais, mapa de calor, comparação', () => {
    const codigo = h.lotericas[0]!.codigoCaixa;
    const de = somarDias(diaSP(agora), -13);
    const ate = diaSP(agora);
    const f = fichaLoterica(codigo, todos, { agora, de, ate })!;
    const meus = todos.filter((b) => b.loterica.codigoCaixa === codigo && diaSP(b.entrouEm) >= de);
    expect(f.boloes).toBe(meus.length);
    expect(f.velocidade.mapaDeCalor.flat().reduce((s, x) => s + x, 0)).toBe(meus.length);
    expect(f.porLoteria.reduce((s, x) => s + x.boloes, 0)).toBe(meus.length);
    expect(f.evolucaoMensal.reduce((s, x) => s + x.boloes, 0)).toBe(meus.length);
    expect(f.resultado.lucro).toBeCloseTo(f.porLoteria.reduce((s, x) => s + x.lucro, 0), 1);
    expect(f.comparacao.lotericasNaUf).toBeGreaterThanOrEqual(f.comparacao.lotericasNaCidade);
    expect(f.aVendaAgora.every((b) => b.disponiveis > 0)).toBe(true);
    expect(fichaLoterica('000000', todos, { agora, de, ate })).toBeNull();
  });
  it('top 10 e panorama nacional', () => {
    const top = topLotericas(todos, { de: somarDias(diaSP(agora), -13), ate: diaSP(agora) });
    expect(top).toHaveLength(10);
    for (let i = 1; i < top.length; i++) expect(top[i - 1]!.valor).toBeGreaterThanOrEqual(top[i]!.valor);
    const itens = concursosAVendaSimulados(h, agora).map((c) => ({ modalidade: c.modalidade, concurso: c.concurso, retrato: retratoMercado(vitrineSimulada(h.verdade(c.id)!, agora), agora, { fechaEm: c.fechaEm }) }));
    const p = panoramaNacional(itens);
    const total = p.at(-1)!;
    expect(total.modalidade).toBe('total');
    expect(total.boloes).toBe(itens.reduce((s, i) => s + i.retrato.boloes, 0));
  });
});
