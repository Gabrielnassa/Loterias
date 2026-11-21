import { describe, expect, it } from 'vitest';
import type { ModalidadeSlug } from '../dominio/modalidades';
import type { LotericaRef } from '../dominio/tipos';
import { compararLotericas, rankingAberturas } from '../raio-x/ranking';
import {
  chanceDeAbrir,
  gradeSemanal,
  metricasSemanais,
  tendencia,
  ultimasSemanas,
  type AberturaInfo,
  type ParticipacaoInfo,
} from '../raio-x/semanal';
import { somarDias, t0Padrao } from '../tempo/fuso';

/**
 * 13 semanas de aberturas (até a semana de 16/11/2026):
 *  - Lotofácil de segunda a sábado; Mega-Sena terça, quinta e sábado.
 *  - Na última semana, também uma Quina no domingo 11:45.
 * Lotéricas com padrões conhecidos:
 *  A (São Paulo/SP): só Lotofácil, seg/qua/sex, 20 s de atraso, 5º na UF (pág. 1), 40º no Brasil (pág. 2)
 *  B (Campinas/SP): todas as aberturas, 300 s, 95º na UF (pág. 4); na Mega fica 60º (pág. 2)
 *  C (Rio/RJ): só na última semana, terça, 31º na UF (pág. 2)
 */
const A: LotericaRef = { codigoCaixa: '99000001', nome: 'Lotérica Alfa', cidade: 'São Paulo', uf: 'SP' };
const B: LotericaRef = { codigoCaixa: '99000002', nome: 'Lotérica Beta', cidade: 'Campinas', uf: 'SP' };
const C: LotericaRef = { codigoCaixa: '99000003', nome: 'Lotérica Gama', cidade: 'Rio de Janeiro', uf: 'RJ' };
const LOTERICAS = new Map([A, B, C].map((l) => [l.codigoCaixa, l]));

const SEMANA_ATUAL = '2026-11-16';
const ATE = new Date(t0Padrao('2026-11-22').getTime() + 12 * 3600_000); // domingo 23:45
const aberturas: AberturaInfo[] = [];
const participacoes: ParticipacaoInfo[] = [];

function participa(l: LotericaRef, a: AberturaInfo, atrasoS: number, posUf: number, posBrasil: number, posCidade: number) {
  participacoes.push({
    aberturaId: a.id,
    lotericaCodigo: l.codigoCaixa,
    primeiroEm: new Date(a.t0.getTime() + atrasoS * 1000),
    atrasoS,
    posCidade,
    posUf,
    posBrasil,
    nBoloes1h: 2,
    valor1h: 1000,
    pctVendido: 0.8,
    sobra: 120,
  });
}

for (let w = 12; w >= 0; w--) {
  const segunda = somarDias(SEMANA_ATUAL, -7 * w);
  for (let d = 0; d < 7; d++) {
    const dia = somarDias(segunda, d);
    const isodow = d + 1;
    const nova = (modalidade: ModalidadeSlug) => {
      const a = { id: `${modalidade}-${dia}`, modalidade, t0: t0Padrao(dia) };
      aberturas.push(a);
      return a;
    };
    if (isodow <= 6) {
      const lf = nova('lotofacil');
      if ([1, 3, 5].includes(isodow)) participa(A, lf, 20, 5, 40, 2);
      participa(B, lf, 300, 95, 400, 10);
      if (w === 0 && isodow === 2) participa(C, lf, 100, 31, 120, 8);
    }
    if ([2, 4, 6].includes(isodow)) {
      const mg = nova('mega-sena');
      participa(B, mg, 280, 60, 250, 9);
    }
    if (w === 0 && isodow === 7) {
      const q = nova('quina');
      participa(A, q, 45, 3, 33, 1);
    }
  }
}

describe('métricas semanais do Raio-X', () => {
  const metA = metricasSemanais(A.codigoCaixa, aberturas, participacoes, { ate: ATE, semanas: 12 });

  it('12 semanas, da mais recente para a mais antiga (segunda-feira)', () => {
    expect(metA.map((m) => m.semana)).toEqual(ultimasSemanas(ATE, 12));
    expect(metA[0]!.semana).toBe(SEMANA_ATUAL);
  });

  it('semana típica de A: 3 de 9 aberturas, seg/qua/sex, sempre na pág. 1 da UF', () => {
    const m = metA[1]!;
    expect(m).toMatchObject({
      aberturasOcorridas: 9,
      participacoes: 3,
      dias: [1, 3, 5],
      atrasoMedianoS: 20,
      melhorPosicao: 5,
      posicaoMediana: 5,
      pctPagina1: 1,
      nBoloes1h: 6,
      valor1h: 3000,
      pctVendido: expect.closeTo(0.8, 10),
      sobra: 360,
    });
    expect(m.taxa).toBeCloseTo(3 / 9);
    expect(m.horarios[0]).toMatchObject({ isodow: 1, hora: '21:45:20', posicao: 5, pagina: 1, modalidade: 'lotofacil' });
  });

  it('domingo 11:45 entra na semana da segunda anterior', () => {
    const m = metA[0]!;
    expect(m.aberturasOcorridas).toBe(10);
    expect(m.participacoes).toBe(4);
    expect(m.dias).toEqual([1, 3, 5, 7]);
    expect(m.melhorPosicao).toBe(3);
    expect(m.posicaoMediana).toBe(5); // [3, 5, 5, 5]
    expect(m.horarios.at(-1)).toMatchObject({ isodow: 7, hora: '11:45:45', modalidade: 'quina' });
  });

  it('filtro de modalidade', () => {
    const mega = metricasSemanais(A.codigoCaixa, aberturas, participacoes, { ate: ATE, semanas: 12, modalidade: 'mega-sena' });
    expect(mega[1]).toMatchObject({ aberturasOcorridas: 3, participacoes: 0, taxa: 0, melhorPosicao: null, pctPagina1: null, sobra: null });
  });

  it('escopo Brasil e cidade', () => {
    expect(metricasSemanais(A.codigoCaixa, aberturas, participacoes, { ate: ATE, escopo: 'brasil' })[1]).toMatchObject({ melhorPosicao: 40, pctPagina1: 0 });
    expect(metricasSemanais(A.codigoCaixa, aberturas, participacoes, { ate: ATE, escopo: 'cidade' })[1]).toMatchObject({ melhorPosicao: 2, pctPagina1: 1 });
  });

  it('B abre tudo, devagar e longe da pág. 1', () => {
    const m = metricasSemanais(B.codigoCaixa, aberturas, participacoes, { ate: ATE })[1]!;
    expect(m).toMatchObject({ aberturasOcorridas: 9, participacoes: 9, taxa: 1, dias: [1, 2, 3, 4, 5, 6], melhorPosicao: 60, pctPagina1: 0 });
    expect(m.atrasoMedianoS).toBe(300);
  });

  it('ignora aberturas futuras e fora das 12 semanas', () => {
    const cedo = metricasSemanais(A.codigoCaixa, aberturas, participacoes, { ate: new Date(t0Padrao('2026-11-18').getTime() - 1), semanas: 1 });
    expect(cedo[0]).toMatchObject({ aberturasOcorridas: 3, participacoes: 1 }); // seg (lf) + ter (lf + mega)
    const todas = metricasSemanais(A.codigoCaixa, aberturas, participacoes, { ate: ATE, semanas: 12 });
    expect(todas.reduce((s, m) => s + m.aberturasOcorridas, 0)).toBe(11 * 9 + 10);
  });
});

describe('tendência e chance de abrir', () => {
  it('C: semana atual 1 x média 0 das 4 anteriores', () => {
    const m = metricasSemanais(C.codigoCaixa, aberturas, participacoes, { ate: ATE });
    expect(tendencia(m, 'participacoes', ATE)).toEqual({ atual: 1, mediaAnteriores: 0, variacao: 1, semanaParcial: true });
  });

  it('A estável: variação 1 por causa da Quina de domingo', () => {
    const m = metricasSemanais(A.codigoCaixa, aberturas, participacoes, { ate: ATE });
    expect(tendencia(m)).toMatchObject({ atual: 4, mediaAnteriores: 3, variacao: 1 });
    expect(tendencia(m, 'atrasoMedianoS').mediaAnteriores).toBe(20);
  });

  it('chance de abrir = frequência naquele dia da semana nas últimas 8 semanas', () => {
    expect(chanceDeAbrir(A.codigoCaixa, '2026-11-23', aberturas, participacoes)).toMatchObject({ isodow: 1, semanasComAbertura: 8, semanasQueAbriu: 8, chance: 1 });
    expect(chanceDeAbrir(A.codigoCaixa, '2026-11-24', aberturas, participacoes).chance).toBe(0);
    expect(chanceDeAbrir(C.codigoCaixa, '2026-11-24', aberturas, participacoes).chance).toBe(1 / 8);
    // domingo: só houve abertura em 1 das 8 semanas anteriores (a Quina de 22/11)
    expect(chanceDeAbrir(A.codigoCaixa, '2026-11-29', aberturas, participacoes)).toMatchObject({ semanasComAbertura: 1, chance: 1 });
    expect(chanceDeAbrir(A.codigoCaixa, '2026-11-29', aberturas, participacoes, { modalidade: 'mega-sena' }).chance).toBeNull();
  });
});

describe('grade semanal (aba Aberturas)', () => {
  it('uma linha por semana, 7 colunas, célula = hora + colocação + página + faixa', () => {
    const g = gradeSemanal(A.codigoCaixa, aberturas, participacoes, { ate: ATE });
    expect(g).toHaveLength(12);
    const linha = g[1]!;
    expect(linha.celulas).toHaveLength(7);
    expect(linha.celulas[0]).toMatchObject({ isodow: 1, participou: true, hora: '21:45:20', posicao: 5, pagina: 1, faixa: 'pag1' });
    expect(linha.celulas[1]).toMatchObject({ isodow: 2, houveAbertura: true, aberturasNoDia: 2, participou: false });
    expect(linha.celulas[1]!.hora).toBeUndefined();
    expect(linha.celulas[6]).toMatchObject({ isodow: 7, houveAbertura: false, participou: false });
    expect(linha).toMatchObject({ total: 3, aberturasOcorridas: 9, melhor: 5, mediana: 5 });
  });

  it('escopo Brasil muda a faixa de cor', () => {
    const g = gradeSemanal(A.codigoCaixa, aberturas, participacoes, { ate: ATE, escopo: 'brasil' });
    expect(g[1]!.celulas[0]).toMatchObject({ posicao: 40, pagina: 2, faixa: 'pag2-3' });
  });

  it('consolidado do dia mostra a melhor colocação entre as modalidades', () => {
    const g = gradeSemanal(B.codigoCaixa, aberturas, participacoes, { ate: ATE });
    expect(g[1]!.celulas[1]).toMatchObject({ participacoesNoDia: 2, posicao: 60, pagina: 2, modalidade: 'mega-sena', faixa: 'pag2-3' });
    expect(g[1]!.celulas[0]).toMatchObject({ posicao: 95, pagina: 4, faixa: 'pag4+' });
    const soLotofacil = gradeSemanal(B.codigoCaixa, aberturas, participacoes, { ate: ATE, modalidade: 'lotofacil' });
    expect(soLotofacil[1]!.celulas[1]).toMatchObject({ participacoesNoDia: 1, posicao: 95 });
  });
});

describe('ranking e comparação', () => {
  const de = new Date(t0Padrao('2026-10-26').getTime() - 1); // últimas 4 semanas
  const filtroSP = { de, ate: ATE, uf: 'SP' };

  it('quem abriu mais / quem chega mais rápido / quem mais fica na pág. 1', () => {
    expect(rankingAberturas(aberturas, participacoes, LOTERICAS, filtroSP, 'mais_aberturas').map((l) => l.loterica.codigoCaixa)).toEqual([B.codigoCaixa, A.codigoCaixa]);
    expect(rankingAberturas(aberturas, participacoes, LOTERICAS, filtroSP, 'mais_rapida').map((l) => l.loterica.codigoCaixa)).toEqual([A.codigoCaixa, B.codigoCaixa]);
    const pag1 = rankingAberturas(aberturas, participacoes, LOTERICAS, filtroSP, 'mais_pagina1');
    expect(pag1[0]).toMatchObject({ posicao: 1, loterica: A, pctPagina1: 1 });
    expect(pag1[1]).toMatchObject({ posicao: 2, pctPagina1: 0, participacoes: 36 });
  });

  it('filtro por UF e cidade (com ou sem acento)', () => {
    expect(rankingAberturas(aberturas, participacoes, LOTERICAS, { de, ate: ATE, uf: 'RJ' }, 'mais_aberturas').map((l) => l.loterica)).toEqual([C]);
    expect(rankingAberturas(aberturas, participacoes, LOTERICAS, { de, ate: ATE, cidade: 'sao paulo' }, 'mais_aberturas').map((l) => l.loterica)).toEqual([A]);
  });

  it('comparar: quem chegou primeiro por dia', () => {
    const dias = compararLotericas([A.codigoCaixa, B.codigoCaixa, C.codigoCaixa], aberturas, participacoes, { de: new Date(t0Padrao(SEMANA_ATUAL).getTime() - 1), ate: ATE });
    const porDia = Object.fromEntries(dias.map((d) => [d.dia, d.primeiro]));
    expect(porDia['2026-11-16']).toBe(A.codigoCaixa); // 20 s x 300 s
    expect(porDia['2026-11-17']).toBe(C.codigoCaixa); // C 100 s x B 280 s (Mega) / 300 s
    expect(porDia['2026-11-22']).toBe(A.codigoCaixa); // Quina
    expect(dias.find((d) => d.dia === '2026-11-17')!.porLoterica[A.codigoCaixa]).toBeUndefined();
    expect(dias[0]!.dia).toBe('2026-11-22');
  });

  it('no máximo você + 5 concorrentes', () => {
    expect(() => compararLotericas(['1', '2', '3', '4', '5', '6', '7'], aberturas, participacoes, filtroSP)).toThrow(RangeError);
  });
});
