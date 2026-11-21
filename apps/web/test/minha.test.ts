import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { horarioSP, normalizarResultadoCaixa } from '@radar/core';
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

  it('Conferência das outras modalidades: +Milionária (trevos) e Loteca (duplo), com resultado REAL', async () => {
    const fixture = (nome: string) =>
      normalizarResultadoCaixa(JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'packages', 'core', 'fonte', 'fixtures', 'resultados', `${nome}.json`), 'utf8')));
    const arr = (xs: number[]) => `{${xs.join(',')}}`;
    const casos = [
      { slug: 'mais-milionaria', r: fixture('maismilionaria-408'), jogos: [
        { numeros: [5, 20, 33, 35, 1, 2, 3], trevos: [1, 3, 6], colunas: null },
        { numeros: [5, 20, 33, 35, 38, 46], trevos: null, colunas: null }, // veio sem os trevos: aviso, não soma
      ] },
      { slug: 'loteca', r: fixture('loteca-1283'), jogos: [
        { numeros: [], trevos: null, colunas: ['2X1121221XXX12'.split('').map((c, i) => (i === 0 ? [c, '1'] : [c]))].flat() },
      ] },
    ];
    for (const { slug, r, jogos } of casos) {
      const [c] = await sql`insert into concursos (modalidade_id, numero, data_sorteio, origem)
        select id, ${r.concurso}, ${r.dataApuracao}::date, 'seed' from modalidades where slug = ${slug} returning id`;
      const [b] = await sql`insert into boloes (id_caixa, loterica_id, concurso_id, jogos, dezenas, cotas_total, valor_cota, valor_aposta,
          cotas_disponiveis, first_seen_at, last_seen_at, fila, fila_calculada, pos_entrada_calc_brasil, pos_entrada_calc_uf, pos_entrada_calc_cidade, status, sobra_final)
        select ${`teste:${slug}`}, l.id, ${c!.id}, ${jogos.length}, 7, 10, 10, 100, 4, ${new Date(ATE.getTime() - 86_400_000).toISOString()}::timestamptz,
          ${ATE.toISOString()}::timestamptz, 1, 1, 1, 1, 1, 'encerrado', 4
        from lotericas l where l.codigo_caixa = '980011' returning id`;
      for (const [ordem, j] of jogos.entries()) {
        await sql`insert into bolao_jogos (bolao_id, ordem, numeros, trevos, colunas)
          values (${b!.id}, ${ordem}, ${arr(j.numeros)}::int[], ${j.trevos ? arr(j.trevos) : null}::int[], ${j.colunas === null ? null : JSON.stringify(j.colunas)}::jsonb)`;
      }
      await sql`insert into resultados (concurso_id, data_apuracao, dezenas, trevos, partidas, acumulado, origem)
        values (${c!.id}, ${r.dataApuracao}::date, ${arr(r.dezenas)}::int[], ${r.trevos ? arr(r.trevos) : null}::int[], ${r.partidas ? JSON.stringify(r.partidas) : null}::jsonb, ${r.acumulado}, 'caixa')`;
      for (const x of r.rateios) {
        await sql`insert into rateios (concurso_id, faixa, descricao, acertos, ganhadores, valor_premio)
          values (${c!.id}, ${x.faixa}, ${x.descricao}, ${x.acertos}, ${x.ganhadores}, ${x.valorPremio})`;
      }
    }
    const conf = await conferenciaMkp(pg, { dias: 30 });
    const mais = conf.linhas.find((l) => l.modalidade === 'mais-milionaria')!;
    expect(mais.sorteio).toBe('05 20 33 35 38 46 + trevos 1 3');
    expect(mais.premioTotal).toBe(6386.69); // 4+2 x3, 4+1/0 x6, 3+2 x4, 3+1 x8
    expect(mais.premioLoterica).toBe(2554.68); // 6.386,69 / 10 x 4
    expect(mais.avisos).toEqual(['jogo 2: jogo sem os trevos']);
    const loteca = conf.linhas.find((l) => l.modalidade === 'loteca')!;
    expect(loteca.sorteio).toBe('2X1121221XXX12');
    expect(loteca.faixasTexto).toEqual(['1× 1º (14 acertos)', '1× 2º (13 acertos)']);
    expect(loteca.premioTotal).toBe(12588.1);
    expect(loteca.origemResultado).toBe('caixa');
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

suite('várias lotéricas do dono (multi-loja) no Postgres', () => {
  let sql: Sql;
  beforeAll(async () => {
    sql = criarSql(await recriarBancoDeTeste(URL!, 'radar_teste_multiloja'), { max: 2 });
    await migrar(sql, () => {});
    await semearHistoricoSimulado(criarDb(sql), { ate: ATE, semanas: 2, nLotericas: 60 });
  }, 120_000);
  afterAll(async () => {
    await sql?.end();
  });

  it('aceita o código em qualquer forma, com nome, e marca a loja que ainda não tem dados', async () => {
    const pg = new FontePostgresRaioX(sql, () => ATE, { minhaLoterica: '21.002894-7=Coli Loterias, 980011' });
    const lojas = await pg.minhasLotericas();
    expect(lojas.map((l) => [l.codigoCaixa, l.nome, l.semDados ?? false])).toEqual([
      ['2894', 'Coli Loterias', true],
      ['980011', 'Lotérica Trevo de Ouro', false],
    ]);
    // a 1ª é a padrão; a Coli ainda não tem bolões no banco (só o seed fictício)
    const coli = await boloesMkp(pg, { loja: '002894' });
    expect(coli.loterica.codigoCaixa).toBe('2894');
    expect(coli.linhas).toEqual([]);
    expect(coli.franquia.limite).toBe(8000);
    const demo = await boloesMkp(pg, { loja: '980011' });
    expect(demo.linhas.length).toBeGreaterThan(0);
    await expect(boloesMkp(pg, { loja: '123456' })).rejects.toThrow(/não está entre as suas/);
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
