import { describe, expect, it } from 'vitest';
import {
  acompanharZerar,
  alertaPremio,
  alertaResultado,
  alertaResumoSemanal,
  alertasDeAbertura,
  alertasDeVendas,
  aparelhoAceita,
  lerPreferencias,
  PREFERENCIAS_PADRAO,
  resumoSemanalDevido,
  vaiZerar,
} from '../notificacoes/alertas';
import type { MetricaSemanal } from '../raio-x/semanal';
import { horarioSP } from '../tempo/fuso';

const L = (c: string, nome = `Lotérica ${c}`) => ({ codigoCaixa: c, nome, cidade: 'São Paulo', uf: 'SP' });
const t0 = horarioSP(2026, 11, 21, 21, 45);

describe('alertas: monitorada entrou na abertura', () => {
  it('só o 1º bolão de cada monitorada, dentro da janela, com atraso e colocação', () => {
    const s = (seg: number) => new Date(t0.getTime() + seg * 1000);
    const a = alertasDeAbertura([
      { loterica: L('1'), aberturaId: 'mega-sena-3089', modalidade: 'mega-sena', concurso: 3089, t0, entrouEm: s(40), posUf: 45 },
      { loterica: L('1'), aberturaId: 'mega-sena-3089', modalidade: 'mega-sena', concurso: 3089, t0, entrouEm: s(7), posUf: 3 },
      { loterica: L('2'), aberturaId: 'mega-sena-3089', modalidade: 'mega-sena', concurso: 3089, t0, entrouEm: s(31 * 60) },
      { loterica: L('2'), aberturaId: 'lotofacil-3880', modalidade: 'lotofacil', concurso: 3880, t0, entrouEm: s(75) },
    ]);
    expect(a.map((x) => x.chave)).toEqual(['abertura:mega-sena-3089:1', 'abertura:lotofacil-3880:2']);
    expect(a[0]).toMatchObject({ titulo: 'Lotérica 1 entrou na abertura', corpo: 'Mega-Sena 3089: 1º bolão às 21:45:07 (+7 s), 3º em SP (pág. 1).', url: '/aberturas/mega-sena-3089' });
    expect(a[1]!.corpo).toContain('(+1 min 15 s)');
  });
});

describe('alertas: preferências por aparelho', () => {
  it('vendas: todas, só de hoje, só o encerramento ou nada', () => {
    const p = (vendas: string) => lerPreferencias({ vendas });
    expect(aparelhoAceita(p('todas'), { categoria: 'venda', hoje: false })).toBe(true);
    expect(aparelhoAceita(p('hoje'), { categoria: 'venda', hoje: false })).toBe(false);
    expect(aparelhoAceita(p('hoje'), { categoria: 'venda', hoje: true })).toBe(true);
    expect(aparelhoAceita(p('encerramento'), { categoria: 'venda', hoje: true })).toBe(false);
    expect(aparelhoAceita(p('encerramento'), { categoria: 'encerramento' })).toBe(true);
    expect(aparelhoAceita(p('nenhuma'), { categoria: 'encerramento' })).toBe(false);
    expect(lerPreferencias({ vendas: 'inventado', premios: false })).toEqual({ ...PREFERENCIAS_PADRAO, premios: false });
    expect(aparelhoAceita(lerPreferencias({ monitoradas: false }), { categoria: 'monitorada-abertura' })).toBe(false);
  });
});

describe('alertas: vendas, zerar, resultado, prêmio', () => {
  it('vendas agrupadas por loja e por "sorteia hoje"', () => {
    const em = new Date('2026-11-22T15:00:00Z');
    const v = (c: string, cotas: number, hoje: boolean, bolao = 'b1') => ({ loterica: L(c), modalidade: 'mega-sena' as const, concurso: 3089, bolaoId: bolao, cotas, valor: cotas * 27.21, em, sorteiaHoje: hoje });
    const a = alertasDeVendas([v('1', 2, true), v('1', 3, true, 'b2'), v('1', 1, false, 'b3'), v('2', 0, true)], em);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ titulo: 'Lotérica 1: 5 cotas vendidas', hoje: true });
    expect(a[0]!.corpo).toMatch(/R\$\s?136,05 em 2 bolões \(Mega-Sena 3089\)/);
  });
  it('previsão de zerar precisa se manter por 45 min e avisa uma vez', () => {
    const agora = new Date('2026-11-22T15:00:00Z');
    expect(vaiZerar({ restantes: 30, vendidasUltimaHora: 10, fechaEm: new Date(agora.getTime() + 4 * 3_600_000), agora })).toEqual({ zera: true, horas: 3 });
    expect(vaiZerar({ restantes: 30, vendidasUltimaHora: 5, fechaEm: new Date(agora.getTime() + 4 * 3_600_000), agora }).zera).toBe(false);
    let e = acompanharZerar(undefined, true, agora);
    expect(e.avisar).toBe(false);
    e = acompanharZerar(e.estado, true, new Date(agora.getTime() + 44 * 60_000));
    expect(e.avisar).toBe(false);
    e = acompanharZerar(e.estado, true, new Date(agora.getTime() + 45 * 60_000));
    expect(e.avisar).toBe(true);
    expect(acompanharZerar(e.estado, true, new Date(agora.getTime() + 50 * 60_000)).avisar).toBe(false);
    // se a previsão cai antes dos 45 min, o relógio recomeça
    let f = acompanharZerar(undefined, true, agora);
    f = acompanharZerar(f.estado, false, new Date(agora.getTime() + 30 * 60_000));
    f = acompanharZerar(f.estado, true, new Date(agora.getTime() + 40 * 60_000));
    expect(acompanharZerar(f.estado, true, new Date(agora.getTime() + 80 * 60_000)).avisar).toBe(false);
  });
  it('resultado e prêmio', () => {
    const em = new Date();
    expect(alertaResultado({ modalidade: 'mega-sena', concurso: 3088, dezenas: [4, 15, 23, 31, 42, 58], acumulou: true, em })).toMatchObject({ chave: 'resultado:mega-sena-3088', corpo: '04 15 23 31 42 58 · acumulou' });
    const p = alertaPremio({ loterica: L('1', 'Loja Centro'), modalidade: 'quina', concurso: 7173, bolaoId: '99', faixa: 'Quadra', premioTotal: 812.4, premioLoterica: 162.48, em });
    expect(p.titulo).toBe('Saiu prêmio na Loja Centro!');
    expect(p.chave).toBe('premio:99');
  });
});

describe('alertas: resumo semanal (segunda 08:00)', () => {
  it('devido a partir de segunda 08:00 (SP), cobrindo a semana anterior', () => {
    expect(resumoSemanalDevido(horarioSP(2026, 11, 23, 7, 59))).toMatchObject({ devido: false, semana: '2026-11-16' });
    expect(resumoSemanalDevido(horarioSP(2026, 11, 23, 8, 0))).toMatchObject({ devido: true, semana: '2026-11-16' });
    expect(resumoSemanalDevido(horarioSP(2026, 11, 22, 20, 0))).toMatchObject({ devido: true, semana: '2026-11-09' });
  });
  it('texto do resumo com as monitoradas', () => {
    const m = (p: number, atraso: number | null): MetricaSemanal => ({ semana: '2026-11-16', aberturasOcorridas: 14, participacoes: p, taxa: p / 14, dias: p ? [1, 2, 3] : [], horarios: [], atrasoMedianoS: atraso, melhorPosicao: null, posicaoMediana: null, pctPagina1: p ? 0.5 : null, nBoloes1h: 0, valor1h: 0, pctVendido: null, sobra: null });
    const a = alertaResumoSemanal('2026-11-16', [{ loterica: L('1', 'Rival A'), m: m(10, 12) }, { loterica: L('2', 'Rival B'), m: m(0, null) }], new Date())!;
    expect(a.titulo).toBe('Resumo da semana 16/11 a 22/11: 1 de 2 monitoradas abriram');
    expect(a.corpo).toBe('Rival A: abriu 10/14 aberturas em 3 dias, atraso mediano +12 s, pág. 1 em 50% · Rival B: não abriu');
    expect(alertaResumoSemanal('2026-11-16', [], new Date())).toBeNull();
  });
});
