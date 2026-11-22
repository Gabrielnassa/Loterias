import { describe, expect, it } from 'vitest';
import { escoposDaSequencia, paginasConhecidas, registrarEscopo, vitrineDoComprador } from '../fonte/escopos';
import { diagnosticarOrdem, posicaoEsperadaNoBloco, spearman } from '../regras/ordem-vitrine';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { custoJogo } from '../dominio/modalidades';
import { resultadoBolao, tarifaPorCota } from '../regras/financeiro';
import { calcularPosicoes, compararVitrine, pagina, posicoesNaEntrada, type BolaoNaVitrine } from '../regras/posicao';
import { centavos } from '../util/estatistica';

/** Regras tiradas da foto real da vitrine de São Paulo (21/11/2026, 16:44-16:53). */
describe('escopos da vitrine: cidade -> resto do estado -> resto do Brasil', () => {
  it('Mega-Sena 3089: 19 páginas da cidade (543 bolões) e depois 89 do estado (2.657)', () => {
    const cab = [
      ...Array.from({ length: 19 }, (_, i) => ({ paginaAtual: i + 1, ultimaPagina: 19, totalRegistros: 543 })),
      ...Array.from({ length: 3 }, (_, i) => ({ paginaAtual: i + 1, ultimaPagina: 89, totalRegistros: 2657 })),
    ];
    const e = escoposDaSequencia(cab);
    expect(e[18]).toEqual({ indice: 0, nome: 'cidade', pagina: 19, totalPaginas: 19, totalItens: 543 });
    expect(e[19]).toEqual({ indice: 1, nome: 'estado', pagina: 1, totalPaginas: 89, totalItens: 2657 });
    expect(e[21]!.pagina).toBe(3);
  });
  it('navegação fora de ordem (voltar com Anterior) mantém o escopo certo; total global conhecido', () => {
    let r = registrarEscopo([], 1, { paginaAtual: 1, ultimaPagina: 13, totalRegistros: 365 });
    for (let g = 2; g <= 14; g++) r = registrarEscopo(r.escopos, g, g <= 13 ? { paginaAtual: g, ultimaPagina: 13, totalRegistros: 365 } : { paginaAtual: 1, ultimaPagina: 64, totalRegistros: 1900 });
    expect(r.indice).toBe(1);
    expect(paginasConhecidas(r.escopos)).toBe(13 + 64); // Lotofácil 3835: 13 da cidade + 64 do estado
    const volta = registrarEscopo(r.escopos, 13, { paginaAtual: 13, ultimaPagina: 13, totalRegistros: 365 });
    expect(volta.indice).toBe(0);
  });
  it('a vitrine do comprador: a cidade dele, depois o resto do estado, depois o resto do Brasil', () => {
    const b = (id: string, fila: number, cidade: string, uf: string) => ({ id, fila, loterica: { cidade, uf }, chegada: Number(id.slice(1)) });
    const itens = [b('a1', 1, 'Campinas', 'SP'), b('a2', 1, 'São Paulo', 'SP'), b('a3', 2, 'Sao Paulo', 'SP'), b('a4', 1, 'Rio de Janeiro', 'RJ'), b('a5', 1, 'São Paulo', 'SP')];
    const v = vitrineDoComprador(itens, { cidade: 'São Paulo', uf: 'SP' }, (x, y) => x.fila - y.fila || x.chegada - y.chegada);
    expect(v.map((s) => [s.escopo, s.itens.map((i) => i.item.id)])).toEqual([
      ['cidade', ['a2', 'a5', 'a3']],
      ['estado', ['a1']],
      ['brasil', ['a4']],
    ]);
    expect(v[1]!.itens[0]).toMatchObject({ posicao: 1, pagina: 1 }); // a numeração recomeça no estado
  });
});

describe('ordem dentro da fila: hipótese plugável', () => {
  const bol = (id: string, lot: string, fila: number, t: number): BolaoNaVitrine => ({ id, lotericaCodigo: lot, loterica: { cidade: 'São Paulo', uf: 'SP' }, fila, firstSeenAt: new Date(t * 1000), ordemFonte: t });
  const vit = [bol('a', 'L1', 1, 1), bol('b', 'L2', 1, 2), bol('c', 'L3', 1, 3), bol('d', 'L1', 2, 4), bol('e', 'L4', 1, 5)];
  it('fila-chegada (padrão) x fila-aleatoria (meio do bloco da fila)', () => {
    const chegada = calcularPosicoes(vit);
    expect(['a', 'b', 'c', 'e', 'd'].map((id) => chegada.get(id)!.cidade.posicao)).toEqual([1, 2, 3, 4, 5]);
    const aleat = calcularPosicoes(vit, undefined, 30, 'fila-aleatoria');
    // fila 1 tem 4 bolões (posições 1 a 4): todos valem a posição esperada 2; a fila 2 começa na 5
    expect(['a', 'b', 'c', 'e', 'd'].map((id) => aleat.get(id)!.cidade.posicao)).toEqual([2, 2, 2, 2, 5]);
    const entrada = posicoesNaEntrada(vit, 30, 'fila-aleatoria');
    expect(entrada.get('e')!.cidade.posicao).toBe(posicaoEsperadaNoBloco(1, 4));
    expect(posicoesNaEntrada(vit).get('e')!.cidade.posicao).toBe(4);
    expect([...vit].sort(compararVitrine).map((x) => x.id)).toEqual(['a', 'b', 'c', 'e', 'd']);
  });
  it('diagnóstico: quedas de fila, trocas 1/2 e correlação com o número do bolão (amostra real)', () => {
    // 1ª página da Mega-Sena 3089 na cidade (pos 1 a 5): filas 1 e números de bolão que não crescem
    const amostra = [
      // números FICTÍCIOS que preservam a ordem relativa dos reais (fixture vitrine-sp-2026-11-21-amostra.json)
      { fila: 1, numeroBolao: 100000303 }, { fila: 1, numeroBolao: 100000505 }, { fila: 1, numeroBolao: 100000707 }, { fila: 1, numeroBolao: 100000404 },
      { fila: 1, numeroBolao: 100000202 }, { fila: 2, numeroBolao: 100000450 }, { fila: 1, numeroBolao: 100000101 },
    ];
    const d = diagnosticarOrdem(amostra);
    expect(d).toMatchObject({ itens: 7, quedasDeFila: 1, trocasFila1e2: 1 });
    expect(Math.abs(d.spearmanNumeroNaFila1!)).toBeLessThan(0.8);
    const emOrdem = Array.from({ length: 20 }, (_, i) => ({ fila: 1, chegada: i * 5 }));
    expect(diagnosticarOrdem(emOrdem).conclusao).toBe('ordem-de-chegada');
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBe(-1);
  });
});

describe('amostra real da vitrine de SP (fixture anonimizada)', () => {
  const amostra = JSON.parse(readFileSync(join(__dirname, '../fonte/fixtures/vitrine-sp-2026-11-21-amostra.json'), 'utf8')) as { colunas: string[]; linhas: (number | string)[][] };
  const linhas = amostra.linhas.map((l) => Object.fromEntries(amostra.colunas.map((c, i) => [c, l[i]])) as Record<string, number>);

  it('valor da cota = jogos x custo do jogo / cotas, truncado no centavo (resíduo na última)', () => {
    for (const l of linhas) {
      const total = l.jogos! * custoJogo('mega-sena', l.dezenas!)!;
      expect(Math.floor((total / l.cotasTotal!) * 100 + 1e-6) / 100).toBe(l.valorCotaSemTarifa);
    }
  });
  it('tarifa de 35% truncada bate com 6 das 7 linhas; a outra é MENOR (tarifa "até 35%": vale a informada pela fonte)', () => {
    const tarifaReal = linhas.map((l) => centavos(l.valorCotaComTarifa! - l.valorCotaSemTarifa!));
    const calculada = linhas.map((l) => tarifaPorCota(l.valorCotaSemTarifa!));
    const diferentes = linhas.filter((_, i) => tarifaReal[i] !== calculada[i]);
    expect(diferentes.map((l) => l.valorCotaSemTarifa)).toEqual([33.6]);
    expect(tarifaReal[1]).toBe(11.75);
    expect(tarifaReal[1]!).toBeLessThan(calculada[1]!);
    // com a tarifa informada pela fonte, o financeiro usa 11,75 por cota vendida
    const f = resultadoBolao({ cotasTotal: 60, valorCotaBase: 33.6, cotasVendidasInternet: 30, tarifaPorCotaFonte: 11.75 });
    expect(f.tarifa).toBe(centavos(30 * 11.75));
  });
  it('posição global na lista da cidade = (página - 1) x 30 + posição na página', () => {
    const globais = linhas.map((l) => (l.pagina! - 1) * 30 + l.posicaoNaPagina!);
    expect(globais).toEqual([1, 2, 3, 4, 5, 27, 38]);
    expect(globais.map((p) => pagina(p))).toEqual(linhas.map((l) => l.pagina));
  });
});

describe('simulação calibrada com a foto real de SP', () => {
  it('Mega-Sena: ~36% vendido a 72% da janela; ~metade das lotéricas com 2+ bolões; Quina quase só 1', async () => {
    const { gerarHistoricoSimulado } = await import('../simulacao/historico');
    const { vitrineSimulada } = await import('../simulacao/mercado-simulado');
    const { retratoMercado } = await import('../mercado/vitrine');
    const { horarioSP } = await import('../tempo/fuso');
    const ate = horarioSP(2026, 11, 21, 12, 0);
    const h = gerarHistoricoSimulado({ ate, semanas: 3, nLotericas: 400 });
    const megas = h.planos.filter((p) => p.modalidade === 'mega-sena' && h.fechaEm(p.id)!.getTime() <= ate.getTime());
    const pcts = megas.map((p) => {
      const sim = h.verdade(p.id)!;
      const t = p.t0.getTime() + 0.72 * (sim.fechaEm.getTime() - p.t0.getTime());
      const r = retratoMercado(vitrineSimulada(sim, t), t, { fechaEm: sim.fechaEm });
      return r.cotasVendidas / (r.cotasVendidas + r.cotas);
    });
    const media = pcts.reduce((s, x) => s + x, 0) / pcts.length;
    expect(media).toBeGreaterThan(0.28); // real: 35,5% (Mega 3089 às 16:44 de sábado)
    expect(media).toBeLessThan(0.46);
    const porFila = (mod: string) => {
      const filas: number[] = [];
      for (const p of h.planos.filter((x) => x.modalidade === mod)) for (const x of p.participantes) for (let f = 0; f < x.nBoloes; f++) filas[f] = (filas[f] ?? 0) + 1;
      return filas;
    };
    const mega = porFila('mega-sena');
    expect(mega[1]! / mega[0]!).toBeGreaterThan(0.3); // real: 129/274 = 0,47
    expect(mega[1]! / mega[0]!).toBeLessThan(0.65);
    const quina = porFila('quina');
    expect(quina[1]! / quina[0]!).toBeLessThan(0.25); // real: 53/427 = 0,12
  });
  it('cota mais cara vende menos na Quina (acima de R$ 100: 18% x 35%)', async () => {
    const { fatorDeVendaPorPreco, vendidoObservadoSP } = await import('../mercado/referencias');
    expect(fatorDeVendaPorPreco('quina', 150)).toBeLessThan(fatorDeVendaPorPreco('quina', 20));
    expect(vendidoObservadoSP('mega-sena', 27.21)).toMatchObject({ faixa: 'R$ 25-50', boloes: 108, pctVendido: 0.31 });
    expect(vendidoObservadoSP('lotofacil', 10)).toBeNull();
  });
});
