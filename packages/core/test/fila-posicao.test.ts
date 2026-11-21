import { describe, expect, it } from 'vitest';
import { calcularFilas, numeroDeFilas } from '../regras/fila';
import {
  calcularPosicoes,
  chaveEscopo,
  faixaPagina,
  normalizarTexto,
  pagina,
  posicoesNaEntrada,
  posicoesObservadas,
  type BolaoNaVitrine,
} from '../regras/posicao';
import { criarAleatorio } from '../util/aleatorio';

const SP = { cidade: 'São Paulo', uf: 'SP' };
const CAMPINAS = { cidade: 'Campinas', uf: 'SP' };
const RIO = { cidade: 'Rio de Janeiro', uf: 'RJ' };
const t = (s: number) => new Date(Date.UTC(2026, 10, 17, 0, 45, s));

function bolao(id: string, cod: string, loc: { cidade: string; uf: string }, fila: number, seg: number, extra: Partial<BolaoNaVitrine> = {}): BolaoNaVitrine {
  return { id, lotericaCodigo: cod, loterica: loc, fila, firstSeenAt: t(seg), ...extra };
}

describe('página', () => {
  it('página = teto(posição / 30)', () => {
    expect(pagina(1)).toBe(1);
    expect(pagina(30)).toBe(1);
    expect(pagina(31)).toBe(2);
    expect(pagina(60)).toBe(2);
    expect(pagina(61)).toBe(3);
    expect(pagina(311)).toBe(11); // exemplo da SPEC: Brasil 311º = pág 11
    expect(pagina(185)).toBe(7); // SP 185º = pág 7
    expect(pagina(117)).toBe(4); // São Paulo 117º = pág 4
  });
  it('posição inválida', () => {
    expect(() => pagina(0)).toThrow(RangeError);
    expect(() => pagina(Number.NaN)).toThrow(RangeError);
  });
  it('faixas de cor do Raio-X', () => {
    expect(faixaPagina(1)).toBe('pag1');
    expect(faixaPagina(2)).toBe('pag2-3');
    expect(faixaPagina(3)).toBe('pag2-3');
    expect(faixaPagina(4)).toBe('pag4+');
  });
});

describe('fila', () => {
  it('ordem de chegada dentro da mesma lotérica; empate pela ordem da fonte', () => {
    const filas = calcularFilas([
      { id: 'a1', lotericaCodigo: 'A', firstSeenAt: t(10) },
      { id: 'a3', lotericaCodigo: 'A', firstSeenAt: t(30) },
      { id: 'a2', lotericaCodigo: 'A', firstSeenAt: t(20) },
      { id: 'b2', lotericaCodigo: 'B', firstSeenAt: t(5), ordemFonte: 9 },
      { id: 'b1', lotericaCodigo: 'B', firstSeenAt: t(5), ordemFonte: 3 },
    ]);
    expect(Object.fromEntries(filas)).toEqual({ a1: 1, a2: 2, a3: 3, b1: 1, b2: 2 });
    expect(numeroDeFilas(filas.values())).toBe(3);
  });
});

describe('escopos', () => {
  it('normaliza acentos e caixa', () => {
    expect(normalizarTexto('  São   Paulo ')).toBe('SAO PAULO');
    expect(chaveEscopo('cidade', { cidade: 'São Paulo', uf: 'sp' })).toBe(chaveEscopo('cidade', { cidade: 'SAO PAULO', uf: 'SP' }));
    expect(chaveEscopo('brasil', SP)).toBe('BR');
  });
  it('cidades homônimas em UFs diferentes não se misturam', () => {
    expect(chaveEscopo('cidade', { cidade: 'Bom Jesus', uf: 'PI' })).not.toBe(chaveEscopo('cidade', { cidade: 'Bom Jesus', uf: 'RS' }));
  });
});

// Cenário: A (São Paulo), B (Campinas), C (Rio).
const cenario = [
  bolao('A1', 'A', SP, 1, 1),
  bolao('B1', 'B', CAMPINAS, 1, 2),
  bolao('A2', 'A', SP, 2, 3),
  bolao('C1', 'C', RIO, 1, 4),
  bolao('B2', 'B', CAMPINAS, 2, 5),
];

describe('posição atual por escopo (fila, first_seen_at)', () => {
  it('1ª fila inteira antes da 2ª', () => {
    const p = calcularPosicoes(cenario);
    const br = (id: string) => p.get(id)!.brasil.posicao;
    expect(['A1', 'B1', 'C1', 'A2', 'B2'].map(br)).toEqual([1, 2, 3, 4, 5]);
    expect(p.get('A2')!.uf.posicao).toBe(3); // SP: A1, B1, A2, B2
    expect(p.get('B2')!.uf.posicao).toBe(4);
    expect(p.get('C1')!.uf.posicao).toBe(1); // RJ
    expect(p.get('A2')!.cidade.posicao).toBe(2); // São Paulo: A1, A2
    expect(p.get('B2')!.cidade.posicao).toBe(2); // Campinas: B1, B2
  });

  it('esgotados saem da vitrine', () => {
    const comSaida = cenario.map((b) => (b.id === 'B1' ? { ...b, saiuEm: t(100) } : b));
    const p = calcularPosicoes(comSaida);
    expect(p.has('B1')).toBe(false);
    expect(p.get('C1')!.brasil.posicao).toBe(2);
    // num instante anterior à saída, B1 ainda conta
    expect(calcularPosicoes(comSaida, t(50)).get('C1')!.brasil.posicao).toBe(3);
  });

  it('página em cada escopo', () => {
    const muitos = Array.from({ length: 65 }, (_, i) => bolao(`X${i}`, `L${i}`, SP, 1, i));
    const p = calcularPosicoes(muitos);
    expect(p.get('X0')!.brasil).toEqual({ posicao: 1, pagina: 1 });
    expect(p.get('X30')!.uf).toEqual({ posicao: 31, pagina: 2 });
    expect(p.get('X64')!.cidade).toEqual({ posicao: 65, pagina: 3 });
  });
});

describe('posição observada (ordem da fonte)', () => {
  it('Brasil = posição observada; UF e cidade = índice no escopo', () => {
    const p = posicoesObservadas([
      { id: 'x', loterica: SP, posicaoObservada: 1 },
      { id: 'y', loterica: RIO, posicaoObservada: 2 },
      { id: 'z', loterica: SP, posicaoObservada: 31 },
    ]);
    expect(p.get('z')).toEqual({ brasil: { posicao: 31, pagina: 2 }, uf: { posicao: 2, pagina: 1 }, cidade: { posicao: 2, pagina: 1 } });
    expect(p.get('y')!.uf.posicao).toBe(1);
  });
});

describe('colocação na ENTRADA (não a atual)', () => {
  it('cada bolão é colocado com o que estava visível quando entrou', () => {
    const p = posicoesNaEntrada(cenario);
    expect(p.get('A1')!.brasil.posicao).toBe(1);
    expect(p.get('B1')!.brasil.posicao).toBe(2);
    expect(p.get('A2')!.brasil.posicao).toBe(3); // A1, B1 na frente
    expect(p.get('C1')!.brasil.posicao).toBe(3); // entra na 1ª fila, na frente de A2
    expect(p.get('B2')!.brasil.posicao).toBe(5);
    expect(p.get('B2')!.uf.posicao).toBe(4);
    // a posição ATUAL de A2 é 4 (C1 passou na frente), mas a de entrada continua 3
    expect(calcularPosicoes(cenario).get('A2')!.brasil.posicao).toBe(4);
  });

  it('desconta quem esgotou antes da entrada', () => {
    const comSaida = cenario.map((b) => (b.id === 'B1' ? { ...b, saiuEm: new Date(t(3).getTime() + 500) } : b));
    const p = posicoesNaEntrada(comSaida);
    expect(p.get('A2')!.brasil.posicao).toBe(3); // B1 ainda visível em t=3
    expect(p.get('C1')!.brasil.posicao).toBe(2); // B1 já tinha saído em t=4
    expect(p.get('B2')!.brasil.posicao).toBe(4);
  });

  it('mesma leitura: ordem da fonte decide e filas menores ficam na frente', () => {
    const p = posicoesNaEntrada([
      bolao('D1', 'D', SP, 1, 10, { ordemFonte: 2 }),
      bolao('E1', 'E', SP, 1, 10, { ordemFonte: 1 }),
      bolao('E2', 'E', SP, 2, 10, { ordemFonte: 3 }),
    ]);
    expect(p.get('E1')!.brasil.posicao).toBe(1);
    expect(p.get('D1')!.brasil.posicao).toBe(2);
    expect(p.get('E2')!.brasil.posicao).toBe(3);
  });

  it('propriedade: igual ao cálculo direto no instante de entrada (dados aleatórios)', () => {
    const rnd = criarAleatorio(42);
    const locais = [SP, CAMPINAS, RIO, { cidade: 'Niterói', uf: 'RJ' }];
    const boloes: BolaoNaVitrine[] = [];
    const porLot = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      const cod = `L${rnd.inteiro(1, 60)}`;
      const fila = (porLot.get(cod) ?? 0) + 1;
      porLot.set(cod, fila);
      const seg = i * 3 + rnd.inteiro(0, 2);
      const sai = rnd.proximo() < 0.2 ? t(seg + rnd.inteiro(1, 300)) : null;
      boloes.push(bolao(`b${i}`, cod, locais[rnd.inteiro(0, 3)]!, fila, seg, { ordemFonte: i, saiuEm: sai }));
    }
    const rapida = posicoesNaEntrada(boloes);
    for (const b of boloes) {
      expect(rapida.get(b.id)).toEqual(calcularPosicoes(boloes, b.firstSeenAt).get(b.id));
    }
  });
});
