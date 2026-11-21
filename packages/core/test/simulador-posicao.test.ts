import { describe, expect, it } from 'vitest';
import { ordenarFilaPreMontada, prepararAberturas, proximaAbertura, simularPosicao } from '../abertura/simulador-posicao';
import type { AberturaInfo, ParticipacaoInfo } from '../raio-x/semanal';
import { gerarHistoricoSimulado } from '../simulacao/historico';
import { horarioSP } from '../tempo/fuso';

const P = (aberturaId: string, codigo: string, atrasoS: number): ParticipacaoInfo => ({ aberturaId, lotericaCodigo: codigo, primeiroEm: new Date(0), atrasoS, posCidade: 0, posUf: 0, posBrasil: 0, nBoloes1h: 1, valor1h: 10 });
const LOCAL: Record<string, { cidade: string; uf: string }> = { a: { cidade: 'São Paulo', uf: 'SP' }, b: { cidade: 'Campinas', uf: 'SP' }, c: { cidade: 'Rio de Janeiro', uf: 'RJ' }, eu: { cidade: 'São Paulo', uf: 'SP' } };

describe('simulador de posição', () => {
  // duas sextas: 20/11 e 13/11 (T0 21:45)
  const aberturas: AberturaInfo[] = [
    { id: 'x', modalidade: 'mega-sena', t0: horarioSP(2026, 11, 20, 21, 45) },
    { id: 'y', modalidade: 'mega-sena', t0: horarioSP(2026, 11, 13, 21, 45) },
    { id: 'z', modalidade: 'mega-sena', t0: horarioSP(2026, 11, 19, 21, 45) }, // quinta: fora
  ];
  const parts = [P('x', 'a', 5), P('x', 'b', 20), P('x', 'c', 1), P('x', 'eu', 2), P('y', 'a', 40), P('y', 'b', 3), P('y', 'c', 8), P('z', 'a', 0)];
  const prep = prepararAberturas({ aberturas, participacoes: parts, localDe: (c) => LOCAL[c], minha: { codigoCaixa: 'eu', cidade: 'Sao Paulo', uf: 'SP' }, modalidade: 'mega-sena', diaSemana: 5, ate: horarioSP(2026, 11, 21, 12, 0) });
  it('posição = 1 + outras lotéricas do escopo que chegaram antes', () => {
    expect(prep).toHaveLength(2); // só as sextas
    const s = simularPosicao(prep, { atrasoS: 10, diaSemana: 5, modalidade: 'mega-sena' });
    const por = Object.fromEntries(s.porEscopo.map((e) => [e.escopo, e]));
    // em x: antes de 10 s -> a (SP capital) e c (RJ); em y: b (Campinas) e c
    expect(por.cidade!.posicaoMediana).toBe(Math.round((2 + 1) / 2)); // x: 2, y: 1 -> mediana 1,5 -> 2
    expect(por.uf!.posicaoMediana).toBe(2); // x: 2, y: 2
    expect(por.brasil!.posicaoMediana).toBe(3); // x: 3, y: 3
    expect(por.brasil!.chancePagina1).toBe(1);
    expect(s.curva[0]).toEqual({ atrasoS: 0, cidade: 1, uf: 1, brasil: 1 });
  });
  it('com o histórico simulado: entrar mais tarde nunca melhora a posição; limite da pág. 1', () => {
    const agora = horarioSP(2026, 11, 21, 12, 0);
    const h = gerarHistoricoSimulado({ ate: agora, semanas: 8, nLotericas: 400 });
    const minha = h.lotericas[0]!;
    const porCodigo = new Map(h.lotericas.map((l) => [l.codigoCaixa, l]));
    const pp = prepararAberturas({ aberturas: h.aberturas, participacoes: h.participacoes, localDe: (c) => porCodigo.get(c), minha, modalidade: 'lotofacil', diaSemana: 5, ate: agora });
    expect(pp.length).toBeGreaterThanOrEqual(7);
    const cedo = simularPosicao(pp, { atrasoS: 5, diaSemana: 5, modalidade: 'lotofacil' });
    const tarde = simularPosicao(pp, { atrasoS: 300, diaSemana: 5, modalidade: 'lotofacil' });
    for (const i of [0, 1, 2]) expect(tarde.porEscopo[i]!.posicaoMediana!).toBeGreaterThanOrEqual(cedo.porEscopo[i]!.posicaoMediana!);
    for (let i = 1; i < cedo.curva.length; i++) expect(cedo.curva[i]!.brasil!).toBeGreaterThanOrEqual(cedo.curva[i - 1]!.brasil!);
    const lim = cedo.limitePagina1.uf;
    expect(lim.quase === null || lim.metade === null || lim.quase <= lim.metade).toBe(true);
    if (lim.metade !== null) expect(simularPosicao(pp, { atrasoS: lim.metade, diaSemana: 5, modalidade: 'lotofacil' }).porEscopo[1]!.chancePagina1!).toBeGreaterThanOrEqual(0.5);
  });
});

describe('cronômetro de abertura', () => {
  it('próxima abertura, alerta às 21:43 e domingo às 11:45', () => {
    const sab = proximaAbertura(horarioSP(2026, 11, 21, 20, 0));
    expect(sab.t0).toEqual(horarioSP(2026, 11, 21, 21, 45));
    expect(sab.alertaEm).toEqual(horarioSP(2026, 11, 21, 21, 43));
    expect(sab.emAndamento).toBe(false);
    expect(sab.faltaS).toBe(105 * 60);
    expect(proximaAbertura(horarioSP(2026, 11, 21, 22, 10)).emAndamento).toBe(true); // dentro da janela de 60 min
    const dom = proximaAbertura(horarioSP(2026, 11, 21, 22, 50));
    expect(dom.t0).toEqual(horarioSP(2026, 11, 22, 11, 45));
    expect(dom.alertaEm).toEqual(horarioSP(2026, 11, 22, 11, 43));
  });
  it('fila pré-montada: o mais valioso primeiro (ele define a posição na 1ª fila)', () => {
    const f = ordenarFilaPreMontada([
      { id: 'a', jogos: 10, dezenas: 16, cotas: 20, valorCota: 10 },
      { id: 'b', jogos: 2, dezenas: 18, cotas: 100, valorCota: 57.12 },
      { id: 'c', jogos: 5, dezenas: 16, cotas: 10, valorCota: 9 },
    ]);
    expect(f.map((x) => [x.id, x.fila, x.valorTotal])).toEqual([['b', 1, 5712], ['a', 2, 200], ['c', 3, 90]]);
    expect(f[0]!.formato).toBe('2J-18D-100C');
  });
});
