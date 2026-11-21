import ExcelJS from 'exceljs';
import { horarioSP } from '@radar/core';
import { criarDb, criarSql, migrar, recriarBancoDeTeste, type Sql } from '@radar/db';
import { semearHistoricoSimulado } from '@radar/db/seed';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as getBoloes } from '../app/api/minha/boloes/route';
import { POST as postEstorno } from '../app/api/minha/boloes/[id]/estorno/route';
import { GET as getConferencia } from '../app/api/minha/conferencia/route';
import { GET as getFinanceiro } from '../app/api/minha/financeiro/route';
import { FonteSimuladaRaioX } from '../lib/dados';
import { FontePostgresRaioX } from '../lib/dados-postgres';
import { definirFonteDeDados } from '../lib/fonte-dados';
import { boloesMkp, conferenciaMkp, financeiroMkp, posicaoMinha } from '../lib/minha';

/** Fase 3 (Minha lotérica) sobre o banco com o seed. Roda só com DATABASE_URL_TESTE (banco radar_teste_minha). */
const URL = process.env.DATABASE_URL_TESTE;
const suite = URL ? describe : describe.skip;
const ATE = horarioSP(2026, 11, 21, 12, 0);
const req = (caminho: string, init?: RequestInit) => new Request(`http://teste.local${caminho}`, init);

suite('Minha lotérica (Fase 3) no Postgres', () => {
  let sql: Sql;
  let pg: FontePostgresRaioX;

  beforeAll(async () => {
    sql = criarSql(await recriarBancoDeTeste(URL!, 'radar_teste_minha'), { max: 4 });
    await migrar(sql, () => {});
    await semearHistoricoSimulado(criarDb(sql), { ate: ATE, semanas: 3, nLotericas: 150 });
    pg = new FontePostgresRaioX(sql, () => ATE, { minhaLoterica: '980011' });
    definirFonteDeDados(pg);
  }, 120_000);
  afterAll(async () => {
    definirFonteDeDados(undefined);
    await sql?.end();
  });

  it('Bolões MKP: franquia, internet x balcão, break-even, colocação', async () => {
    const d = await boloesMkp(pg, { dias: 7 });
    expect(d.loterica.codigoCaixa).toBe('980011');
    expect(d.linhas.length).toBeGreaterThan(5);
    expect(d.linhas.some((l) => l.vendidasBalcao > 0)).toBe(true);
    for (const l of d.linhas) {
      expect(l.vendidasInternet + l.vendidasBalcao + l.disponiveis).toBe(l.cotasTotal);
      expect(l.colocacaoEntrada.uf.pagina).toBe(Math.ceil(l.colocacaoEntrada.uf.posicao / 30));
    }
    expect(d.franquia.limite).toBe(8000);
  });

  it('Financeiro MKP: total = soma dos bolões; dia a dia e maiores lucros/prejuízos', async () => {
    const f = await financeiroMkp(pg, { de: '2026-11-01', ate: '2026-11-21' });
    expect(f.boloes.length).toBeGreaterThan(10);
    expect(f.total.lucro).toBeCloseTo(f.boloes.reduce((s, b) => s + b.lucro, 0), 1);
    expect(f.porDia.reduce((s, d) => s + d.cotasVendidas, 0)).toBe(f.total.cotasVendidas);
    expect(f.maioresLucros.every((b) => b.lucro > 0)).toBe(true);
  });

  it('Conferência MKP: prêmio da lotérica = prêmio / cotas x sobradas', async () => {
    const c = await conferenciaMkp(pg, { dias: 30 });
    expect(c.linhas.length).toBeGreaterThan(5);
    for (const l of c.linhas) expect(l.premioLoterica).toBeCloseTo((l.premioTotal / l.cotasTotal) * l.cotasSobradas, 1);
    expect(c.linhas.every((l) => l.origemResultado === 'seed')).toBe(true);
  });

  it('Posição na abertura 7/30/90', async () => {
    for (const dias of [7, 30, 90]) {
      const p = await posicaoMinha(pg, { dias });
      expect(p.calendario).toHaveLength(dias);
    }
  });

  it('estorno manual tira o bolão do financeiro e pode ser desfeito', async () => {
    const antes = await financeiroMkp(pg, { de: '2026-11-01', ate: '2026-11-21' });
    const alvo = antes.boloes.find((b) => b.lucro !== 0)!;
    const r = await postEstorno(req(`/api/minha/boloes/${alvo.id}/estorno`, { method: 'POST', body: JSON.stringify({ estornado: true }) }), { params: Promise.resolve({ id: alvo.id }) });
    expect(await r.json()).toMatchObject({ estornado: true, mudou: true });
    const depois = await financeiroMkp(pg, { de: '2026-11-01', ate: '2026-11-21' });
    expect(depois.total.lucro).toBeCloseTo(antes.total.lucro - alvo.lucro, 1);
    const [ev] = await sql`select count(*)::int as n from eventos_bolao where bolao_id = ${Number(alvo.id)} and tipo = 'estorno'`;
    expect(ev!.n).toBe(1);
    await postEstorno(req('/x', { method: 'POST', body: JSON.stringify({ estornado: false }) }), { params: Promise.resolve({ id: alvo.id }) });
    expect((await financeiroMkp(pg, { de: '2026-11-01', ate: '2026-11-21' })).total.lucro).toBeCloseTo(antes.total.lucro, 1);
    // pedido inválido
    expect((await postEstorno(req('/x', { method: 'POST', body: '{}' }), { params: Promise.resolve({ id: alvo.id }) })).status).toBe(400);
  });

  it('exporta CSV e Excel (bolões, financeiro, conferência)', async () => {
    const csv = await (await getBoloes(req('/api/minha/boloes?dias=7&formato=csv'))).text();
    expect(csv.split('\r\n')[0]).toContain('Modalidade;Concurso;Entrada;Formato');
    const fin = await getFinanceiro(req('/api/minha/financeiro?de=2026-11-01&ate=2026-11-21&formato=xlsx'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await fin.arrayBuffer());
    expect(wb.getWorksheet('Financeiro')!.rowCount).toBeGreaterThan(10);
    const conf = await (await getConferencia(req('/api/minha/conferencia?dias=30&formato=csv'))).text();
    expect(conf).toContain('Seu prêmio (R$)');
  });
});

describe('Minha lotérica sem banco', () => {
  it('bolões/financeiro/conferência respondem 409 explicando que precisa do banco', async () => {
    definirFonteDeDados(new FonteSimuladaRaioX(() => ATE, 60 * 60_000, { semanas: 2, nLotericas: 100 }));
    const r = await getBoloes(req('/api/minha/boloes'));
    expect(r.status).toBe(409);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/banco/);
    definirFonteDeDados(undefined);
  });
});
