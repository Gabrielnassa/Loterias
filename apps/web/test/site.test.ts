import { horarioSP } from '@radar/core';
import { criarDb, criarSql, migrar, recriarBancoDeTeste, type Sql } from '@radar/db';
import { semearHistoricoSimulado } from '@radar/db/seed';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GET as getArte } from '../app/api/artes/[tipo]/route';
import { POST as postEvento } from '../app/api/site/[slug]/evento/route';
import sitemap from '../app/sitemap';
import { renderizarPng, TIPOS_ARTE } from '../lib/artes';
import { dadosDaArte } from '../lib/artes-dados';
import { FonteSimuladaRaioX } from '../lib/dados';
import { FontePostgresRaioX } from '../lib/dados-postgres';
import { definirFonteDeDados } from '../lib/fonte-dados';
import { boloesDoSite, metricasDoSiteNoPeriodo, registrarEvento, salvarSite, siteDoSlug, sitesConhecidos } from '../lib/site';

/** Fase 5: site público e artes, na simulação e (com DATABASE_URL_TESTE) no banco com o seed. */
const AGORA = horarioSP(2026, 11, 20, 23, 30);
const fonte = new FonteSimuladaRaioX(() => AGORA, 60 * 60_000, { semanas: 2, nLotericas: 120 });
const req = (caminho: string, init?: RequestInit) => new Request(`http://teste.local${caminho}`, init);
const ctx = <T>(p: T) => ({ params: Promise.resolve(p) });

/** Largura e altura do PNG (cabeçalho IHDR). */
function tamanhoPng(b: Buffer | Uint8Array) {
  const buf = Buffer.from(b);
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

beforeAll(() => definirFonteDeDados(fonte));
afterAll(() => definirFonteDeDados(undefined));
afterEach(() => {
  delete process.env.RADAR_SITES;
});

describe('site público (simulação)', () => {
  it('a lotérica do dono ganha um endereço pelo nome; RADAR_SITES completa e sobrescreve', async () => {
    const [padrao] = await sitesConhecidos(fonte);
    expect(padrao).toMatchObject({ slug: 'loterica-trevo-de-ouro', origem: 'padrao', tema: 'classico' });
    expect(padrao!.linkCaixa).toBe(`https://www.loteriasonline.caixa.gov.br/silce-web/#/bolao-caixa/${padrao!.loterica.codigoCaixa}`);
    process.env.RADAR_SITES = JSON.stringify([{ codigo: padrao!.loterica.codigoCaixa, slug: 'trevo', whatsapp: '(11) 99999-0000', instagram: '@trevo', tema: 'sorte' }]);
    const s = (await siteDoSlug(fonte, 'trevo'))!;
    expect(s).toMatchObject({ whatsapp: '5511999990000', instagram: 'trevo', tema: 'sorte', origem: 'configuracao' });
    expect(await siteDoSlug(fonte, 'mercado')).toBeNull(); // rota do painel
  });
  it('bolões à venda da lotérica com cota com tarifa, jogos de demonstração e chance do prêmio', async () => {
    const site = (await siteDoSlug(fonte, 'loterica-trevo-de-ouro'))!;
    const bs = await boloesDoSite(fonte, site);
    expect(bs.length).toBeGreaterThan(0);
    for (const b of bs) {
      expect(b.disponiveis).toBeGreaterThan(0);
      expect(b.valorCota).toBeGreaterThan(b.valorCotaBase);
      expect(b.jogosNumeros).toHaveLength(b.jogos);
      expect(b.jogosNumeros![0]).toHaveLength(b.dezenas);
      expect(b.jogosDemonstracao).toBe(true);
      expect(b.chance.principalUmEm).toBeGreaterThan(0);
    }
  });
  it('métricas: visita, WhatsApp, CAIXA e carrinho pela API (sem dado pessoal)', async () => {
    const post = (corpo: unknown) => postEvento(req('/api/site/loterica-trevo-de-ouro/evento', { method: 'POST', body: JSON.stringify(corpo), headers: { 'content-type': 'application/json' } }), ctx({ slug: 'loterica-trevo-de-ouro' }));
    expect((await post({ tipo: 'visita', visitante: 'a1' })).status).toBe(204);
    await post({ tipo: 'visita', visitante: 'a1' });
    await post({ tipo: 'visita', visitante: 'b2' });
    await post({ tipo: 'whatsapp', visitante: 'b2' });
    await post({ tipo: 'carrinho', visitante: 'b2', bolaoId: 'x' });
    expect((await post({ tipo: 'hack', visitante: 'a1' })).status).toBe(400);
    expect((await post({ tipo: 'visita', visitante: 'com espaço' })).status).toBe(400);
    const m = await metricasDoSiteNoPeriodo(fonte, (await siteDoSlug(fonte, 'loterica-trevo-de-ouro'))!, 30);
    expect(m).toMatchObject({ visitas: 3, pessoas: 2, whatsapp: 1, carrinho: 1, caixa: 0 });
  });
  it('sitemap só com os sites das lotéricas', async () => {
    const sm = await sitemap();
    expect(sm.map((x) => x.url)).toContain('http://localhost:3000/loterica-trevo-de-ouro');
  });
});

describe('artes com Satori', () => {
  it('as 4 artes saem em PNG 1080 x 1080 com a marca da lotérica', async () => {
    for (const tipo of TIPOS_ARTE) {
      const { no, demonstracao } = await dadosDaArte(fonte, tipo);
      expect(JSON.stringify(no)).toContain('Lotérica Trevo de Ouro');
      expect(tamanhoPng(await renderizarPng(no))).toEqual([1080, 1080]);
      if (tipo !== 'boloes') expect(demonstracao).toBe(true); // sem banco: dados de demonstração
    }
  });
  it('API devolve PNG no tamanho pedido e recusa tipo desconhecido', async () => {
    const r = await getArte(req('/api/artes/resultado?tamanho=540'), ctx({ tipo: 'resultado' }));
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('x-dados')).toBe('demonstracao');
    expect(tamanhoPng(new Uint8Array(await r.arrayBuffer()))).toEqual([540, 540]);
    expect((await getArte(req('/api/artes/outra'), ctx({ tipo: 'outra' }))).status).toBe(404);
  });
});

const URL = process.env.DATABASE_URL_TESTE;
const suite = URL ? describe : describe.skip;

suite('site e artes no Postgres (seed)', () => {
  let sql: Sql;
  let pg: FontePostgresRaioX;
  const ATE = horarioSP(2026, 11, 21, 12, 0);
  beforeAll(async () => {
    sql = criarSql(await recriarBancoDeTeste(URL!, 'radar_teste_site'), { max: 4 });
    await migrar(sql, () => {});
    await semearHistoricoSimulado(criarDb(sql), { ate: ATE, semanas: 2, nLotericas: 80 });
    pg = new FontePostgresRaioX(sql, () => ATE, { minhaLoterica: '980011' });
  }, 120_000);
  afterAll(async () => {
    await sql?.end();
  });

  it('grava o site, conta eventos em site_eventos e lê os bolões com os jogos do banco', async () => {
    const site = await salvarSite(pg, '980011', { slug: 'trevo-de-ouro', whatsapp: '11 98888-7777', tema: 'noite', sobre: 'Desde 1998.' });
    expect(site).toMatchObject({ slug: 'trevo-de-ouro', whatsapp: '5511988887777', tema: 'noite', origem: 'banco' });
    await registrarEvento(pg, site, { tipo: 'visita', visitante: 'v1' });
    await registrarEvento(pg, site, { tipo: 'caixa', visitante: 'v1', bolaoId: '1' });
    const m = await metricasDoSiteNoPeriodo(pg, site, 30);
    expect(m).toMatchObject({ visitas: 1, pessoas: 1, caixa: 1 });
    const { n } = (await sql<{ n: number }[]>`select count(*)::int as n from site_eventos`)[0]!;
    expect(n).toBe(2);
    const bs = await boloesDoSite(pg, site);
    // o seed encerra os concursos passados: só aparecem os ainda à venda
    for (const b of bs) expect(b.jogosDemonstracao).toBe(false);
    const arte = await dadosDaArte(pg, 'resultado', { modalidade: 'lotofacil' });
    expect(arte.demonstracao).toBe(false); // resultado (simulado) gravado no banco pelo seed
    expect(JSON.stringify(arte.no)).toContain('Lotofácil');
  });
});
