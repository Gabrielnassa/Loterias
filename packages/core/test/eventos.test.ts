import { describe, expect, it } from 'vitest';
import type { LotericaRef } from '../dominio/tipos';
import { aplicarLeitura, encerrarConcurso, marcarEstorno, novoEstadoConcurso } from '../eventos/estado';
import type { BolaoFonte } from '../fonte/tipos';
import type { LeituraVitrine } from '../fonte/varredura';

const A: LotericaRef = { codigoCaixa: '99000001', nome: 'Lotérica Teste A', cidade: 'São Paulo', uf: 'SP' };
const B: LotericaRef = { codigoCaixa: '99000002', nome: 'Lotérica Teste B', cidade: 'Rio de Janeiro', uf: 'RJ' };
const T0 = new Date('2026-11-17T00:45:00Z');
const em = (s: number) => new Date(T0.getTime() + s * 1000);

function b(id: string, loterica: LotericaRef, disp: number, total = 10): BolaoFonte {
  return { idCaixa: id, loterica, modalidade: 'lotofacil', concurso: 3500, jogos: 6, dezenas: 17, cotasTotal: total, cotasDisponiveis: disp, valorCotaBase: 71.4 };
}

function leitura(s: number, itens: BolaoFonte[], completa = true): LeituraVitrine {
  return {
    modalidade: 'lotofacil',
    concurso: 3500,
    iniciouEm: em(s),
    terminouEm: em(s),
    paginasLidas: 1,
    completa,
    ordemDaVitrine: true,
    duplicados: 0,
    itens: itens.map((it, i) => ({ ...it, posicaoObservada: i + 1, vistoEm: em(s) })),
  };
}

const ref = { modalidade: 'lotofacil' as const, concurso: 3500 };

describe('eventos derivados de pares de snapshots', () => {
  it('bolao_novo grava first_seen_at, fila e posição observada; empate marcado na mesma leitura', () => {
    const e = novoEstadoConcurso(ref);
    const r = aplicarLeitura(e, leitura(5, [b('x', A, 10), b('y', B, 5)]));
    expect(r.eventos.map((ev) => [ev.idCaixa, ev.tipo])).toEqual([['x', 'bolao_novo'], ['y', 'bolao_novo']]);
    const x = e.boloes.get('x')!;
    expect(x.firstSeenAt).toEqual(em(5));
    expect(x.fila).toBe(1);
    expect(x.empateEntrada).toBe(true);
    expect(x.posEntradaObservada!.brasil.posicao).toBe(1);
    expect(e.boloes.get('y')!.posEntradaObservada!.uf.posicao).toBe(1); // RJ
    expect(e.boloes.get('y')!.posEntradaCalculada.brasil.posicao).toBe(2);
    expect(r.linhas).toHaveLength(2);
  });

  it('venda, 2ª fila e linhas só de quem mudou', () => {
    const e = novoEstadoConcurso(ref);
    aplicarLeitura(e, leitura(5, [b('x', A, 10), b('y', B, 5)]));
    const r = aplicarLeitura(e, leitura(10, [b('x', A, 8), b('y', B, 5), b('z', A, 10)]));
    expect(r.eventos).toEqual([
      { idCaixa: 'z', tipo: 'bolao_novo', em: em(10), quantidade: 10 },
      { idCaixa: 'x', tipo: 'venda', em: em(10), quantidade: 2 },
    ]);
    const z = e.boloes.get('z')!;
    expect(z.fila).toBe(2);
    expect(z.empateEntrada).toBe(false);
    expect(z.posEntradaObservada!.brasil.posicao).toBe(3);
    expect(r.linhas.map((l) => l.idCaixa).sort()).toEqual(['x', 'z']);
    expect(r.alterados.map((a) => a.idCaixa)).toEqual(['x']);
    expect(e.boloes.get('y')!.lastSeenAt).toEqual(em(10));
  });

  it('keyframe grava todos os vistos', () => {
    const e = novoEstadoConcurso(ref);
    aplicarLeitura(e, leitura(5, [b('x', A, 10), b('y', B, 5)]));
    expect(aplicarLeitura(e, leitura(10, [b('x', A, 10), b('y', B, 5)]), { keyframe: true }).linhas).toHaveLength(2);
  });

  it('esgotou quando disponíveis = 0', () => {
    const e = novoEstadoConcurso(ref);
    aplicarLeitura(e, leitura(5, [b('x', A, 3)]));
    const r = aplicarLeitura(e, leitura(10, [b('x', A, 0)]));
    expect(r.eventos.map((ev) => ev.tipo)).toEqual(['venda', 'esgotou']);
    expect(e.boloes.get('x')!.status).toBe('esgotado');
    expect(e.boloes.get('x')!.esgotouEm).toEqual(em(10));
  });

  it('sumiu: só após 2 leituras COMPLETAS seguidas; venda e esgotou inferidos na 1ª ausência', () => {
    const e = novoEstadoConcurso(ref);
    aplicarLeitura(e, leitura(5, [b('x', A, 10), b('y', B, 4)]));
    // leitura parcial: ausência não conta
    expect(aplicarLeitura(e, leitura(10, [b('x', A, 10)], false)).eventos).toEqual([]);
    expect(e.boloes.get('y')!.ausencias).toBe(0);
    // 1ª completa sem y: ainda não conclui
    expect(aplicarLeitura(e, leitura(15, [b('x', A, 10)])).eventos).toEqual([]);
    // 2ª completa sem y: conclui com data da 1ª ausência
    const r = aplicarLeitura(e, leitura(20, [b('x', A, 10)]));
    expect(r.eventos).toEqual([
      { idCaixa: 'y', tipo: 'venda', em: em(15), quantidade: 4, inferido: true },
      { idCaixa: 'y', tipo: 'esgotou', em: em(15), quantidade: 0, inferido: true },
    ]);
    expect(r.linhas).toEqual([{ idCaixa: 'y', coletadoEm: em(15), cotasDisponiveis: 0, presente: false, posicao: null }]);
  });

  it('reaparecer interrompe a contagem de ausências', () => {
    const e = novoEstadoConcurso(ref);
    aplicarLeitura(e, leitura(5, [b('x', A, 10), b('y', B, 4)]));
    aplicarLeitura(e, leitura(10, [b('x', A, 10)]));
    aplicarLeitura(e, leitura(15, [b('x', A, 10), b('y', B, 4)]));
    expect(aplicarLeitura(e, leitura(20, [b('x', A, 10)])).eventos).toEqual([]);
    expect(e.boloes.get('y')!.status).toBe('a_venda');
  });

  it('devolução quando disponíveis aumentam (ex.: carrinho expirou)', () => {
    const e = novoEstadoConcurso(ref);
    aplicarLeitura(e, leitura(5, [b('x', A, 5)]));
    const r = aplicarLeitura(e, leitura(10, [b('x', A, 7)]));
    expect(r.eventos).toEqual([{ idCaixa: 'x', tipo: 'devolucao', em: em(10), quantidade: 2 }]);
  });

  it('encerrou: sobra = disponíveis no último snapshot; esgotados sobram 0', () => {
    const e = novoEstadoConcurso(ref);
    aplicarLeitura(e, leitura(5, [b('x', A, 10), b('y', B, 4)]));
    aplicarLeitura(e, leitura(10, [b('x', A, 3), b('y', B, 0)]));
    const r = encerrarConcurso(e, em(3600));
    expect(r.eventos).toEqual([
      { idCaixa: 'x', tipo: 'encerrou', em: em(3600), quantidade: 3 },
      { idCaixa: 'y', tipo: 'encerrou', em: em(3600), quantidade: 0 },
    ]);
    expect(e.boloes.get('x')!.sobraFinal).toBe(3);
    // depois de encerrado, novas leituras são ignoradas
    expect(aplicarLeitura(e, leitura(4000, [b('x', A, 1)])).eventos).toEqual([]);
    expect(encerrarConcurso(e, em(5000)).eventos).toEqual([]);
  });

  it('estorno manual marca e desmarca', () => {
    const e = novoEstadoConcurso(ref);
    aplicarLeitura(e, leitura(5, [b('x', A, 10)]));
    expect(marcarEstorno(e, 'x', em(50), true)).toEqual({ idCaixa: 'x', tipo: 'estorno', em: em(50), quantidade: 1 });
    expect(e.boloes.get('x')!.status).toBe('estornado');
    expect(marcarEstorno(e, 'x', em(60), true)).toBeNull();
    expect(marcarEstorno(e, 'x', em(70), false)!.quantidade).toBe(-1);
    expect(e.boloes.get('x')!.status).toBe('a_venda');
    expect(encerrarConcurso(e, em(100)).eventos).toHaveLength(1);
  });

  it('estado recarregado do banco continua a numeração das filas', () => {
    const e1 = novoEstadoConcurso(ref);
    aplicarLeitura(e1, leitura(5, [b('x', A, 10), b('z', A, 10)]));
    const e2 = novoEstadoConcurso(ref, [...e1.boloes.values()]);
    aplicarLeitura(e2, leitura(10, [b('x', A, 10), b('z', A, 10), b('w', A, 10)]));
    expect(e2.boloes.get('w')!.fila).toBe(3);
  });

  it('recusa leitura de outro concurso', () => {
    const e = novoEstadoConcurso(ref);
    expect(() => aplicarLeitura(e, { ...leitura(5, []), concurso: 9999 })).toThrow();
  });
});

describe('fila observada (campo index da CAIXA) x fila calculada', () => {
  const comFila = (id: string, l: LotericaRef, disp: number, filaFonte: number) => ({ ...b(id, l, disp), filaFonte });

  it('usa a fila da fonte como efetiva e guarda a calculada', () => {
    const e = novoEstadoConcurso(ref);
    // a fonte diz que o 1º bolão visto de A já é da 2ª fila (o da 1ª fila foi inserido antes do coletor)
    aplicarLeitura(e, leitura(5, [comFila('x', A, 10, 2)]));
    const x = e.boloes.get('x')!;
    expect(x).toMatchObject({ fila: 2, filaCalculada: 1, filaObservada: 2, filaObservadaEntrada: 2 });
  });

  it('colocação calculada usa a fila efetiva', () => {
    const e = novoEstadoConcurso(ref);
    const r = aplicarLeitura(e, { ...leitura(5, [comFila('x', A, 10, 2), comFila('y', B, 10, 1)]), ordemDaVitrine: false });
    expect(r.novos.find((n) => n.idCaixa === 'y')!.posEntradaCalculada.brasil.posicao).toBe(1);
    expect(r.novos.find((n) => n.idCaixa === 'x')!.posEntradaCalculada.brasil.posicao).toBe(2);
    expect(r.novos.every((n) => n.posEntradaObservada === null)).toBe(true);
  });

  it('se a fonte muda o index depois, acompanha (fila dinâmica) e marca como alterado', () => {
    const e = novoEstadoConcurso(ref);
    aplicarLeitura(e, leitura(5, [comFila('x', A, 10, 1), comFila('z', A, 10, 2)]));
    const r = aplicarLeitura(e, leitura(10, [comFila('z', A, 10, 1)]));
    const z = e.boloes.get('z')!;
    expect(z).toMatchObject({ fila: 1, filaCalculada: 2, filaObservada: 1, filaObservadaEntrada: 2 });
    expect(r.alterados.map((a) => a.idCaixa)).toContain('z');
  });

  it('sem index, fila efetiva = calculada', () => {
    const e = novoEstadoConcurso(ref);
    aplicarLeitura(e, leitura(5, [b('x', A, 10), b('z', A, 10)]));
    expect(e.boloes.get('z')).toMatchObject({ fila: 2, filaCalculada: 2, filaObservada: null });
  });
});
