import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conferirBolao, conferirJogo, distribuicaoDeAcertos, premioDaAposta, type PremioAposta } from '../conferencia/premios';
import { brutoParaGuardar, classificarFaixa, normalizarResultadoCaixa } from '../conferencia/resultado';
import { mesDaSorte, normalizarTime, type ColunaLoteca } from '../dominio/jogo';
import { FormatoInesperadoError } from '../fonte/erros';

/** JSON REAL da API de resultados da CAIXA (baixado em 21/11/2026), exceto o Super Sete (sintético). */
function fixture(nome: string) {
  return normalizarResultadoCaixa(JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fonte', 'fixtures', 'resultados', `${nome}.json`), 'utf8')));
}
const QUINA = fixture('quina-7172');
const LOTOFACIL = fixture('lotofacil-3834');
const DUPLA = fixture('duplasena-3034');
const LOTOMANIA = fixture('lotomania-3001');
const TIMEMANIA = fixture('timemania-2470');
const DIA_DE_SORTE = fixture('diadesorte-1352');
const MAIS_MILIONARIA = fixture('maismilionaria-408');
const LOTECA = fixture('loteca-1283');
const SUPER_SETE = fixture('supersete-sintetico');

const r2 = (x: number) => Math.round(x * 100) / 100;
const resumo = (p: PremioAposta | null) => p!.faixas.map((f) => [f.faixa, f.quantidade]);

describe('descrições das faixas', () => {
  it('classifica acertos, trevos, Time do Coração e Mês da Sorte', () => {
    expect(classificarFaixa('4 acertos')).toEqual({ tipo: 'acertos', acertos: 4 });
    expect(classificarFaixa('1º (14 acertos)')).toEqual({ tipo: 'acertos', acertos: 14 });
    expect(classificarFaixa('0 acertos')).toEqual({ tipo: 'acertos', acertos: 0 });
    expect(classificarFaixa('6 acertos + 2 trevos')).toEqual({ tipo: 'acertos-trevos', acertos: 6, trevos: [2] });
    expect(classificarFaixa('6 acertos + 1 ou nenhum trevo')).toEqual({ tipo: 'acertos-trevos', acertos: 6, trevos: [0, 1] });
    expect(classificarFaixa('3 acertos + 1 trevo')).toEqual({ tipo: 'acertos-trevos', acertos: 3, trevos: [1] });
    expect(classificarFaixa('Time do Coração')).toEqual({ tipo: 'time-coracao', acertos: null });
    expect(classificarFaixa('Mês da Sorte')).toEqual({ tipo: 'mes-sorte', acertos: null });
  });
  it('lê o mês e compara o time sem acento nem pontuação', () => {
    expect(mesDaSorte('Junho')).toBe(6);
    expect(mesDaSorte('MARÇO')).toBe(3);
    expect(mesDaSorte('jul')).toBe(7);
    expect(mesDaSorte('06')).toBe(6);
    expect(mesDaSorte('13')).toBeNull();
    expect(normalizarTime('CUIABA           /MT')).toBe(normalizarTime('Cuiabá/MT'));
  });
});

describe('resultados oficiais de todas as modalidades', () => {
  it('normaliza o que cada uma tem de próprio', () => {
    expect(QUINA).toMatchObject({ modalidade: 'quina', concurso: 7172, dezenas: [4, 11, 40, 45, 48] });
    expect(DUPLA).toMatchObject({ modalidade: 'dupla-sena', dezenas: [8, 11, 15, 22, 28, 37], dezenas2: [19, 22, 23, 28, 30, 48] });
    expect(LOTOMANIA.dezenas).toHaveLength(20);
    expect(TIMEMANIA).toMatchObject({ modalidade: 'timemania', timeCoracao: 'CUIABA /MT' });
    expect(DIA_DE_SORTE).toMatchObject({ modalidade: 'dia-de-sorte', mesSorte: 6 });
    expect(MAIS_MILIONARIA).toMatchObject({ modalidade: 'mais-milionaria', dezenas: [5, 20, 33, 35, 38, 46], trevos: [1, 3] });
    // Super Sete: a ordem das colunas é a do sorteio, não a lista ordenada
    expect(SUPER_SETE).toMatchObject({ modalidade: 'super-sete', dezenas: [4, 0, 7, 1, 9, 3, 4] });
    // nas modalidades sem time/mês o campo vem cheio de bytes nulos: ignorado
    expect(QUINA.timeCoracao).toBeUndefined();
    expect(QUINA.mesSorte).toBeUndefined();
  });
  it('Loteca: coluna de cada jogo pelo placar', () => {
    expect(LOTECA.dezenas).toEqual([]);
    expect(LOTECA.partidas).toHaveLength(14);
    expect(LOTECA.partidas![0]).toEqual({ jogo: 1, time1: 'SINGAPURA', time2: 'BRASIL', gols1: 0, gols2: 7, coluna: '2', sorteado: false });
    expect(LOTECA.partidas!.map((p) => p.coluna).join('')).toBe('2X1121221XXX12');
  });
  it('Loteca: jogo não realizado vale a coluna sorteada', () => {
    const bruto = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fonte', 'fixtures', 'resultados', 'loteca-1283.json'), 'utf8'));
    bruto.listaResultadoEquipeEsportiva[0] = { ...bruto.listaResultadoEquipeEsportiva[0], nuGolEquipeUm: null, nuGolEquipeDois: null, icSorteioResultado: 1, resultado: 'EMPATE' };
    bruto.listaResultadoEquipeEsportiva[1] = { ...bruto.listaResultadoEquipeEsportiva[1], icSorteioResultado: 1, resultado: null };
    const r = normalizarResultadoCaixa(bruto);
    expect(r.partidas![0]).toMatchObject({ coluna: 'X', sorteado: true });
    expect(r.partidas![1]).toMatchObject({ coluna: null, sorteado: true }); // sorteio ainda não publicado
    expect(conferirJogo({ numeros: [], palpites: Array.from({ length: 14 }, () => ['1', 'X', '2'] as ColunaLoteca[]) }, r)).toEqual({ motivo: 'resultado da Loteca incompleto' });
  });
  it('JSON bruto sem bytes nulos para o jsonb do PostgreSQL', () => {
    const bruto = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fonte', 'fixtures', 'resultados', 'quina-7172.json'), 'utf8'));
    expect(bruto.nomeTimeCoracaoMesSorte).toContain('\u0000');
    const limpo = brutoParaGuardar(bruto) as typeof bruto;
    expect(JSON.stringify(limpo)).not.toContain('\\u0000');
    expect(limpo.nomeTimeCoracaoMesSorte).toBe('');
    expect(limpo.listaRateioPremio).toEqual(bruto.listaRateioPremio);
  });
  it('Dia de Sorte com mês desconhecido é formato inesperado', () => {
    const bruto = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fonte', 'fixtures', 'resultados', 'diadesorte-1352.json'), 'utf8'));
    expect(() => normalizarResultadoCaixa({ ...bruto, nomeTimeCoracaoMesSorte: 'Smarch' })).toThrow(FormatoInesperadoError);
  });
});

describe('Quina e Lotofácil (rateio real)', () => {
  it('Quina com 7 números e 4 acertos: 3 quadras, 12 ternos e 6 duques', () => {
    const p = premioDaAposta([4, 11, 40, 45, 1, 2, 3], QUINA)!;
    expect(p.apostasSimples).toBe(21);
    expect(resumo(p)).toEqual([[2, 3], [3, 12], [4, 6]]);
    expect(p.total).toBe(r2(3 * 7534.97 + 12 * 107.61 + 6 * 4.33));
  });
  it('Lotofácil com 11 acertos', () => {
    const p = premioDaAposta([2, 3, 4, 6, 7, 9, 11, 13, 15, 17, 20, 1, 5, 8, 10], LOTOFACIL)!;
    expect(p.acertos).toBe(11);
    expect(p.total).toBe(7);
  });
});

describe('Dupla Sena (faixas dos dois sorteios com a mesma descrição)', () => {
  it('cada sorteio usa as próprias faixas, sem contar duas vezes', () => {
    const p = premioDaAposta([8, 11, 15, 22, 28, 50], DUPLA)!; // 5 no 1º, 2 no 2º
    expect(p.faixas.map((f) => [f.sorteio, f.faixa, f.acertos])).toEqual([[1, 2, 5]]);
    expect(p.total).toBe(3417.59);
    const q = premioDaAposta([22, 28, 19, 23, 8, 11], DUPLA)!; // quadra nos dois sorteios
    expect(q.faixas.map((f) => [f.sorteio, f.faixa])).toEqual([[1, 3], [2, 7]]);
    expect(q.acertos2).toBe(4);
    expect(q.total).toBe(r2(92.71 + 121.66));
  });
});

describe('Lotomania (50 números de 00 a 99)', () => {
  const sorteadas = new Set(LOTOMANIA.dezenas);
  const naoSorteadas = Array.from({ length: 100 }, (_, i) => i).filter((x) => !sorteadas.has(x));
  it('16 acertos', () => {
    const jogo = [...LOTOMANIA.dezenas.slice(0, 16), ...naoSorteadas.slice(0, 34)];
    const p = premioDaAposta(jogo, LOTOMANIA)!;
    expect(p.acertos).toBe(16);
    expect(p.faixas.map((f) => [f.descricao, f.valor])).toEqual([['16 acertos', 44.16]]);
  });
  it('0 acertos também é faixa; o "00" pode vir como 100', () => {
    const jogo = naoSorteadas.slice(0, 50).map((x) => (x === 0 ? 100 : x));
    expect(jogo).toContain(100);
    const p = premioDaAposta(jogo, LOTOMANIA)!;
    expect(p.faixas.map((f) => [f.descricao, f.quantidade])).toEqual([['0 acertos', 1]]);
  });
  it('jogo com menos de 50 números não é conferido', () => {
    expect(conferirJogo([1, 2, 3], LOTOMANIA)).toEqual({ motivo: 'jogo com números inválidos' });
  });
});

describe('Timemania (10 números + Time do Coração)', () => {
  const jogo = [3, 4, 6, 22, 51, 1, 2, 5, 7, 8]; // 5 acertos
  it('números e time somam faixas', () => {
    const p = premioDaAposta({ numeros: jogo, timeCoracao: 'Cuiabá/MT' }, TIMEMANIA)!;
    expect(p.acertouTime).toBe(true);
    expect(p.faixas.map((f) => [f.descricao, f.valor])).toEqual([['5 acertos', 1541.29], ['Time do Coração', 8.5]]);
    expect(p.total).toBe(1549.79);
  });
  it('time errado não premia; jogo sem time fica pendente', () => {
    expect(premioDaAposta({ numeros: jogo, timeCoracao: 'FLAMENGO/RJ' }, TIMEMANIA)!.total).toBe(1541.29);
    const p = premioDaAposta(jogo, TIMEMANIA)!;
    expect(p.total).toBe(1541.29);
    expect(p.pendencias).toEqual(['jogo sem o Time do Coração']);
  });
});

describe('Dia de Sorte (7 a 15 números + Mês da Sorte)', () => {
  it('8 números com 6 acertos e o mês: 2 senas, 6 quinas e 8 meses', () => {
    const p = premioDaAposta({ numeros: [4, 7, 8, 13, 16, 26, 1, 2], mesSorte: 6 }, DIA_DE_SORTE)!;
    expect(p.apostasSimples).toBe(8);
    expect(resumo(p)).toEqual([[2, 2], [3, 6], [5, 8]]);
    expect(p.total).toBe(r2(2 * 2052.96 + 6 * 25 + 8 * 2.5));
  });
});

describe('+Milionária (números x trevos)', () => {
  it('aposta simples: 3 acertos + 1 trevo', () => {
    const p = premioDaAposta({ numeros: [5, 20, 33, 1, 2, 3], trevos: [1, 2] }, MAIS_MILIONARIA)!;
    expect(p.acertosTrevos).toBe(1);
    expect(p.faixas.map((f) => [f.descricao, f.valor])).toEqual([['3 acertos + 1 trevo', 24]]);
  });
  it('7 números (4 acertos) e 3 trevos (2 acertos): 21 apostas simples', () => {
    const p = premioDaAposta({ numeros: [5, 20, 33, 35, 1, 2, 3], trevos: [1, 3, 6] }, MAIS_MILIONARIA)!;
    expect(p.apostasSimples).toBe(21);
    // 4+2: 3x1; 4+(0|1): 3x2; 3+2: 4x1; 3+1: 4x2
    expect(resumo(p)).toEqual([[5, 3], [6, 6], [7, 4], [8, 8]]);
    expect(p.total).toBe(r2(3 * 1771.61 + 6 * 113.31 + 4 * 50 + 8 * 24));
  });
  it('2 acertos sem trevo não premia; jogo sem trevos não é conferido', () => {
    expect(premioDaAposta({ numeros: [5, 20, 1, 2, 3, 4], trevos: [2, 4] }, MAIS_MILIONARIA)!.total).toBe(0);
    expect(conferirJogo([5, 20, 33, 35, 38, 46], MAIS_MILIONARIA)).toEqual({ motivo: 'jogo sem os trevos' });
  });
});

describe('Super Sete (um dígito por coluna)', () => {
  it('6 colunas certas', () => {
    const p = premioDaAposta({ numeros: [], colunas: [[4], [0], [7], [1], [9], [3], [5]] }, SUPER_SETE)!;
    expect(p.acertos).toBe(6);
    expect(p.total).toBe(15000);
  });
  it('duas colunas com 2 dígitos (4 apostas simples): x^5 (x + 1)^2', () => {
    const p = premioDaAposta({ numeros: [], colunas: [[4, 5], [0], [7], [1], [9], [3], [4, 2]] }, SUPER_SETE)!;
    expect(p.apostasSimples).toBe(4);
    expect(resumo(p)).toEqual([[1, 1], [2, 2], [3, 1]]);
    expect(p.total).toBe(2 * 15000 + 900);
  });
  it('sem as 7 colunas não confere', () => {
    expect(conferirJogo([4, 0, 7, 1, 9, 3, 4], SUPER_SETE)).toEqual({ motivo: 'jogo sem as 7 colunas' });
  });
});

describe('Loteca (14 jogos, duplos e triplos)', () => {
  const certos = '2X1121221XXX12'.split('') as ColunaLoteca[];
  const palpites = (f: (c: ColunaLoteca, i: number) => ColunaLoteca[]) => ({ numeros: [], palpites: certos.map(f) });
  it('14 acertos', () => {
    expect(premioDaAposta(palpites((c) => [c]), LOTECA)!.total).toBe(12489.04);
  });
  it('um erro, um duplo e um triplo: 1 aposta com 13, 3 com 12, 2 com 11', () => {
    const p = premioDaAposta(
      palpites((c, i) => (i === 0 ? ['1'] : i === 1 ? ['X', '1'] : i === 2 ? ['1', 'X', '2'] : [c])),
      LOTECA,
    )!;
    expect(p.apostasSimples).toBe(6);
    expect(distribuicaoDeAcertos([1, 2, 3, ...Array(11).fill(1)], [false, true, true, ...Array(11).fill(true)]).slice(11)).toEqual([2, 3, 1, 0]);
    expect(p.faixas.map((f) => [f.descricao, f.quantidade])).toEqual([['2º (13 acertos)', 1]]);
    expect(p.total).toBe(99.06);
  });
  it('duplo no jogo 1 com tudo certo: 14 + 13', () => {
    expect(premioDaAposta(palpites((c, i) => (i === 0 ? ['2', '1'] : [c])), LOTECA)!.total).toBe(r2(12489.04 + 99.06));
  });
});

describe('conferência do bolão em qualquer modalidade', () => {
  it('soma os jogos conferidos e lista os que não deu para conferir', () => {
    const c = conferirBolao(
      [{ numeros: [5, 20, 33, 1, 2, 3], trevos: [1, 2] }, [5, 20, 33, 35, 38, 46]],
      MAIS_MILIONARIA,
      4,
      1,
    )!;
    expect(c.premioTotal).toBe(24);
    expect(c.premioLoterica).toBe(6);
    expect(c.naoConferidos).toEqual([{ ordem: 1, motivo: 'jogo sem os trevos' }]);
  });
});

describe('jogos do bolão com marcações extras (detalhe da CAIXA, formato provável)', () => {
  it('lê trevos, time, mês, colunas e palpites quando vierem; senão fica só nos números', async () => {
    const { normalizarDetalheBolaoCaixa } = await import('../fonte/adaptadores/caixa-bruto');
    const base = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fonte', 'fixtures', 'caixa', 'detalhar-bolao-exemplo.json'), 'utf8'));
    const payload = base.payload ?? base;
    const com = (tipoJogo: string, apostas: unknown[]) => normalizarDetalheBolaoCaixa({ ...base, payload: { ...payload, modalidade: tipoJogo, qtdApostas: apostas.length, apostas } });
    expect(com('MAIS_MILIONARIA', [{ numeros: [1, 2, 3, 4, 5, 6], trevos: ['1', '4'] }]).jogosDetalhe).toEqual([{ numeros: [1, 2, 3, 4, 5, 6], trevos: [1, 4] }]);
    expect(com('TIMEMANIA', [{ numeros: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], timeCoracao: 'CUIABA/MT' }]).jogosDetalhe![0]!.timeCoracao).toBe('CUIABA/MT');
    expect(com('DIA_DE_SORTE', [{ dezenas: '01 02 03 04 05 06 07', mesDaSorte: 'Junho' }]).jogosDetalhe).toEqual([{ numeros: [1, 2, 3, 4, 5, 6, 7], mesSorte: 6 }]);
    expect(com('SUPER_SETE', [{ colunas: [[1], [2, 3], [4], [5], [6], [7], [8]] }]).jogosDetalhe![0]!.colunas![1]).toEqual([2, 3]);
    expect(com('LOTECA', [{ palpites: ['1', '1X', 'X12', ...Array(11).fill('2')] }]).jogosDetalhe![0]!.palpites!.slice(0, 3)).toEqual([['1'], ['1', 'X'], ['X', '1', '2']]);
    // Mega-Sena não precisa de extras; jogo sem a marcação também não vira "detalhe"
    expect(com('MEGA_SENA', [{ numeros: [1, 2, 3, 4, 5, 6] }]).jogosDetalhe).toBeUndefined();
    expect(com('TIMEMANIA', [{ numeros: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }]).jogosDetalhe).toBeUndefined();
  });
});
