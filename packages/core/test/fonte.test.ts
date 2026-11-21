import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BloqueadoPelaFonteError,
  carregarFixture,
  FonteCaixaHttp,
  FonteFixture,
  FonteIndisponivelError,
  FonteNaoMapeadaError,
  FormatoInesperadoError,
  MonitorSaudeFonte,
  validarPagina,
  varrerConcurso,
  type BolaoFonte,
  type FonteBoloes,
  type PaginaBoloes,
} from '../fonte';
import { agregarMercado, minutoDe } from '../mercado/agregar';

const DIR = join(import.meta.dirname, '..', 'fonte', 'fixtures');
const ler = (nome: string) => JSON.parse(readFileSync(join(DIR, nome), 'utf8'));
const lotofacil = carregarFixture(ler('lotofacil-3880-abertura-21h50.json'));
const mega = carregarFixture(ler('mega-sena-3105-domingo-14h.json'));
const AGORA = new Date('2026-11-24T00:50:00Z');

describe('contrato do formato normalizado', () => {
  it('fixtures passam no contrato', () => {
    const p = ler('pagina-exemplo.json');
    const pagina = validarPagina({ ...p, obtidaEm: new Date(p.obtidaEm) });
    expect(pagina.itens).toHaveLength(30);
    expect(pagina.itens.every((b) => b.cotasDisponiveis <= b.cotasTotal)).toBe(true);
  });

  const base = (): PaginaBoloes => ({
    consulta: { modalidade: 'mega-sena', concurso: 3105, pagina: 1 },
    pagina: 1,
    tamanhoPagina: 30,
    itens: mega.itens.slice(0, 3).map((b) => ({ ...b })),
    ordemDaVitrine: true,
    obtidaEm: AGORA,
  });

  it.each([
    ['campo obrigatório ausente', (p: PaginaBoloes) => delete (p.itens[0] as Partial<BolaoFonte>).cotasTotal],
    ['disponíveis maior que total', (p: PaginaBoloes) => (p.itens[0]!.cotasDisponiveis = 999)],
    ['UF fora do padrão', (p: PaginaBoloes) => (p.itens[0]!.loterica.uf = 'sp')],
    ['bolão de outro concurso', (p: PaginaBoloes) => (p.itens[0]!.concurso = 1)],
    ['modalidade desconhecida', (p: PaginaBoloes) => ((p.itens[0] as { modalidade: string }).modalidade = 'bingo')],
    ['página maior que o tamanho', (p: PaginaBoloes) => (p.tamanhoPagina = 2)],
  ])('rejeita: %s', (_nome, estragar) => {
    const p = base();
    p.itens = p.itens.map((b) => ({ ...b, loterica: { ...b.loterica } }));
    estragar(p);
    expect(() => validarPagina(p)).toThrow(FormatoInesperadoError);
  });
});

describe('varredura (prova de conceito com a fonte fixture)', () => {
  const fonte = new FonteFixture([lotofacil, mega], () => AGORA);

  it('lê da página 1 até a última, com posição observada contínua', async () => {
    const l = await varrerConcurso(fonte, { modalidade: 'lotofacil', concurso: 3880 });
    expect(l.completa).toBe(true);
    expect(l.paginasLidas).toBe(Math.ceil(lotofacil.itens.length / 30));
    expect(l.itens.map((i) => i.posicaoObservada)).toEqual(lotofacil.itens.map((_, i) => i + 1));
    expect(l.itens[0]!.vistoEm).toEqual(AGORA);
  });

  it('baixa só 3 páginas quando limitado (PoC da Fase 0)', async () => {
    const l = await varrerConcurso(fonte, { modalidade: 'lotofacil', concurso: 3880 }, { maxPaginas: 3 });
    expect(l.paginasLidas).toBe(3);
    expect(l.itens).toHaveLength(90);
    expect(l.completa).toBe(false);
  });

  it('concursos e contagens', async () => {
    expect((await fonte.concursosAbertos()).map((c) => c.concurso).sort()).toEqual([3105, 3880]);
    const c = (await fonte.contagens()).find((x) => x.concurso === 3105)!;
    expect(c.boloes).toBe(mega.itens.length);
  });

  it('filtros por UF e lotérica', async () => {
    const p = await fonte.pagina({ modalidade: 'mega-sena', concurso: 3105, pagina: 1, uf: 'RJ' });
    expect(p.itens.every((b) => b.loterica.uf === 'RJ')).toBe(true);
    const cod = mega.itens[0]!.loterica.codigoCaixa;
    const q = await fonte.pagina({ modalidade: 'mega-sena', concurso: 3105, pagina: 1, codigoLoterica: cod });
    expect(q.itens.every((b) => b.loterica.codigoCaixa === cod)).toBe(true);
  });

  it('vitrine que anda durante a leitura: duplicados são descartados', async () => {
    const itens = mega.itens.slice(0, 60);
    let chamadas = 0;
    const andando: FonteBoloes = {
      nome: 'andando',
      concursosAbertos: async () => [],
      contagens: async () => [],
      pagina: async (c) => {
        chamadas++;
        // antes da página 2, um bolão novo entra na frente e empurra todo mundo 1 posição
        const lista = c.pagina === 1 ? itens : [{ ...itens[0]!, idCaixa: 'novo' }, ...itens];
        return { consulta: c, pagina: c.pagina, tamanhoPagina: 30, itens: lista.slice((c.pagina - 1) * 30, c.pagina * 30), ordemDaVitrine: true, obtidaEm: AGORA };
      },
    };
    const l = await varrerConcurso(andando, { modalidade: 'mega-sena', concurso: 3105 });
    expect(l.duplicados).toBe(1);
    expect(new Set(l.itens.map((i) => i.idCaixa)).size).toBe(l.itens.length);
    expect(chamadas).toBe(3);
  });

  it('erro na 1ª página propaga; erro depois vira leitura parcial', async () => {
    const quebrada = (falharEm: number): FonteBoloes => ({
      nome: 'quebrada',
      concursosAbertos: async () => [],
      contagens: async () => [],
      pagina: async (c) => {
        if (c.pagina === falharEm) throw new FonteIndisponivelError('HTTP 503');
        return fonte.pagina(c);
      },
    });
    await expect(varrerConcurso(quebrada(1), { modalidade: 'lotofacil', concurso: 3880 })).rejects.toThrow(FonteIndisponivelError);
    const parcial = await varrerConcurso(quebrada(2), { modalidade: 'lotofacil', concurso: 3880 });
    expect(parcial.completa).toBe(false);
    expect(parcial.paginasLidas).toBe(1);
    expect(parcial.erro).toBeInstanceOf(FonteIndisponivelError);
  });

  it('adaptador da CAIXA ainda não mapeado avisa claramente', async () => {
    await expect(new FonteCaixaHttp().pagina({ modalidade: 'mega-sena', concurso: 1, pagina: 1 })).rejects.toThrow(FonteNaoMapeadaError);
  });
});

describe('saúde da fonte', () => {
  it('alerta na 3ª falha seguida, uma vez só; sucesso zera', () => {
    const m = new MonitorSaudeFonte(3);
    expect(m.registrarFalha(new Error('a'))).toBeNull();
    expect(m.registrarFalha(new Error('b'))).toBeNull();
    expect(m.registrarFalha(new Error('c'))).toMatchObject({ motivo: 'falhas_seguidas', falhasSeguidas: 3 });
    expect(m.registrarFalha(new Error('d'))).toBeNull();
    m.registrarSucesso();
    expect(m.falhasSeguidas).toBe(0);
    expect(m.registrarFalha(new Error('e'))).toBeNull();
  });
  it('mudança de formato e bloqueio alertam na hora', () => {
    expect(new MonitorSaudeFonte().registrarFalha(new FormatoInesperadoError('x'))).toMatchObject({ motivo: 'formato_mudou' });
    expect(new MonitorSaudeFonte().registrarFalha(new BloqueadoPelaFonteError('x', 403))).toMatchObject({ motivo: 'bloqueado' });
  });
});

describe('mercado por UF', () => {
  it('agrega Brasil e UFs, ignorando esgotados', () => {
    const linhas = agregarMercado([
      { loterica: { codigoCaixa: 'A', uf: 'SP' }, cotasDisponiveis: 10, valorCotaBase: 10 },
      { loterica: { codigoCaixa: 'A', uf: 'SP' }, cotasDisponiveis: 5, valorCotaBase: 20 },
      { loterica: { codigoCaixa: 'B', uf: 'RJ' }, cotasDisponiveis: 1, valorCotaBase: 7.5 },
      { loterica: { codigoCaixa: 'C', uf: 'RJ' }, cotasDisponiveis: 0, valorCotaBase: 99 },
    ]);
    expect(linhas).toEqual([
      { uf: 'BR', boloes: 3, cotasDisponiveis: 16, lotericas: 2, valorAVenda: 207.5 },
      { uf: 'RJ', boloes: 1, cotasDisponiveis: 1, lotericas: 1, valorAVenda: 7.5 },
      { uf: 'SP', boloes: 2, cotasDisponiveis: 15, lotericas: 1, valorAVenda: 200 },
    ]);
    expect(minutoDe(new Date('2026-11-17T00:45:37.123Z')).toISOString()).toBe('2026-11-17T00:45:00.000Z');
  });
});
