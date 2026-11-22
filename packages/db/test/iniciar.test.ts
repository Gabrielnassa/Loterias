import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarDb, criarSql, type Sql } from '../cliente';
import { chavesVapidSalvas, garantirChavesVapid, gerarParVapid } from '../config-sistema';
import { acaoDemo } from '../iniciar';
import { migrar } from '../migrar';
import { limparDadosDeOrigem } from '../seed';
import { recriarBancoDeTeste } from '../teste';

describe('container migrate: o que fazer com os dados de demonstração', () => {
  it('FONTE real (caixa-*) sempre limpa os fictícios, mesmo com SEED_DEMO=true', () => {
    expect(acaoDemo({ FONTE: 'caixa-navegador', SEED_DEMO: 'true' })).toBe('limpar');
    expect(acaoDemo({ FONTE: 'caixa-links' })).toBe('limpar');
  });
  it('fonte de teste: SEED_DEMO=true semeia, limpar limpa, vazio não faz nada', () => {
    expect(acaoDemo({ FONTE: 'simulada', SEED_DEMO: 'true' })).toBe('semear');
    expect(acaoDemo({ FONTE: 'simulada', SEED_DEMO: 'limpar' })).toBe('limpar');
    expect(acaoDemo({ FONTE: 'simulada', SEED_DEMO: 'false' })).toBe('nada');
    expect(acaoDemo({})).toBe('nada');
  });
  it('par VAPID P-256: pública = ponto não comprimido (65 bytes), privada = 32 bytes, base64url', () => {
    const p = gerarParVapid();
    const pub = Buffer.from(p.publica, 'base64url');
    expect(pub).toHaveLength(65);
    expect(pub[0]).toBe(4);
    expect(Buffer.from(p.privada, 'base64url')).toHaveLength(32);
    expect(p.publica).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(gerarParVapid().publica).not.toBe(p.publica);
  });
});

const URL = process.env.DATABASE_URL_TESTE;
const suite = URL ? describe : describe.skip;

suite('container migrate no PostgreSQL', () => {
  let sql: Sql;
  beforeAll(async () => {
    sql = criarSql(await recriarBancoDeTeste(URL!, 'radar_teste_iniciar'), { max: 2 });
    await migrar(sql, () => {});
  });
  afterAll(async () => {
    await sql?.end();
  });

  it('chaves VAPID: geradas uma vez e guardadas; o ambiente tem prioridade', async () => {
    expect(await chavesVapidSalvas(sql, {})).toBeNull();
    const a = await garantirChavesVapid(sql, {});
    const b = await garantirChavesVapid(sql, {});
    expect(a.origem).toBe('banco');
    expect(b.publica).toBe(a.publica);
    expect((await chavesVapidSalvas(sql, {}))?.privada).toBe(a.privada);
    const env = await garantirChavesVapid(sql, { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
    expect(env).toEqual({ publica: 'pub', privada: 'priv', origem: 'ambiente' });
  });

  it('limpar dados fictícios apaga só a origem pedida (nunca os da vitrine real)', async () => {
    const [m] = await sql<{ id: number }[]>`select id from modalidades where slug = 'lotofacil'`;
    const [l] = await sql<{ id: number }[]>`insert into lotericas (codigo_caixa, nome, cidade, uf) values ('970001', 'Loja Teste', 'Campinas', 'SP') returning id`;
    for (const [numero, origem] of [[3880, 'simulacao'], [3500, 'fonte']] as const) {
      const [c] = await sql<{ id: number }[]>`insert into concursos (modalidade_id, numero, origem) values (${m!.id}, ${numero}, ${origem}) returning id`;
      const [b] = await sql<{ id: number }[]>`
        insert into boloes (id_caixa, loterica_id, concurso_id, jogos, dezenas, cotas_total, valor_cota, valor_aposta,
          cotas_disponiveis, first_seen_at, last_seen_at, fila, fila_calculada, pos_entrada_calc_brasil, pos_entrada_calc_uf, pos_entrada_calc_cidade)
        values (${'B' + numero}, ${l!.id}, ${c!.id}, 1, 15, 10, 1.8, 18, 5, now(), now(), 1, 1, 1, 1, 1) returning id`;
      await sql`insert into snapshots_bolao (coletado_em, bolao_id, cotas_disponiveis) values (now(), ${b!.id}, 5)`;
      await sql`insert into eventos_bolao (bolao_id, tipo, em) values (${b!.id}, 'bolao_novo', now())`;
      await sql`insert into coletas (tipo, modo, modalidade, concurso, iniciou_em) values ('varredura', 'abertura', 'lotofacil', ${numero}, now())`;
      await sql`insert into aberturas (concurso_id, t0) values (${c!.id}, now())`;
    }
    expect(await limparDadosDeOrigem(criarDb(sql), 'simulacao')).toBe(1);
    const restam = await sql<{ numero: number }[]>`select numero from concursos order by numero`;
    expect(restam.map((r) => r.numero)).toEqual([3500]);
    const [n] = await sql<{ b: number; s: number; e: number; k: number; a: number }[]>`
      select (select count(*)::int from boloes) as b, (select count(*)::int from snapshots_bolao) as s,
             (select count(*)::int from eventos_bolao) as e, (select count(*)::int from coletas) as k,
             (select count(*)::int from aberturas) as a`;
    expect(n).toEqual({ b: 1, s: 1, e: 1, k: 1, a: 1 });
    expect(await limparDadosDeOrigem(criarDb(sql), 'seed')).toBe(0);
  });
});
