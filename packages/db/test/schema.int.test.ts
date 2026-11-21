import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarSql, type Sql } from '../cliente';
import { garantirParticoes, migrar, removerParticoesAntigas } from '../migrar';
import { todasAsTabelas } from '../schema';
import { recriarBancoDeTeste } from '../teste';

/**
 * Integração com PostgreSQL real. Roda só com DATABASE_URL_TESTE; cria/APAGA o banco
 * radar_teste_db no mesmo servidor:
 *   DATABASE_URL_TESTE=postgres://postgres@localhost:5432/postgres pnpm --filter @radar/db test
 */
const URL = process.env.DATABASE_URL_TESTE;
const suite = URL ? describe : describe.skip;

suite('schema no PostgreSQL', () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = criarSql(await recriarBancoDeTeste(URL!, 'radar_teste_db'), { max: 2 });
  });
  afterAll(async () => {
    await sql?.end();
  });

  it('aplica as migrações uma vez só', async () => {
    expect(await migrar(sql, () => {})).toEqual(['0001_inicial.sql', '0002_fila_observada.sql', '0003_t0_por_concurso.sql', '0004_resultados.sql']);
    expect(await migrar(sql, () => {})).toEqual([]);
  });

  it('schema Drizzle bate com as colunas do banco', async () => {
    for (const tabela of Object.values(todasAsTabelas)) {
      const cfg = getTableConfig(tabela);
      const cols = await sql<{ column_name: string; is_nullable: string }[]>`
        select column_name, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = ${cfg.name}`;
      const doBanco = new Map(cols.map((c) => [c.column_name, c.is_nullable === 'NO']));
      expect([...doBanco.keys()].sort(), cfg.name).toEqual(cfg.columns.map((c) => c.name).sort());
      for (const c of cfg.columns) {
        // colunas de PK composta são NOT NULL no banco mesmo sem notNull() explícito
        if (c.notNull) expect(doBanco.get(c.name), `${cfg.name}.${c.name}`).toBe(true);
      }
    }
  });

  it('snapshots_bolao é particionada por dia e cada linha cai na partição certa', async () => {
    await garantirParticoes(sql, 3);
    const [{ parts }] = await sql<[{ parts: number }]>`
      select count(*)::int as parts from pg_inherits i join pg_class p on p.oid = i.inhparent
      where p.relname = 'snapshots_bolao'`;
    expect(parts).toBeGreaterThanOrEqual(5); // default + ontem..+3
    const agora = new Date();
    await sql`insert into snapshots_bolao (coletado_em, bolao_id, cotas_disponiveis) values (${agora}, 1, 10)`;
    const [linha] = await sql<{ particao: string }[]>`select tableoid::regclass::text as particao from snapshots_bolao where bolao_id = 1`;
    const dia = agora.toISOString().slice(0, 10).replaceAll('-', '');
    expect(linha!.particao).toBe(`snapshots_bolao_p${dia}`);
    // datas sem partição caem na default em vez de falhar a coleta
    await sql`insert into snapshots_bolao (coletado_em, bolao_id, cotas_disponiveis) values ('2030-01-01T00:00:00Z', 2, 1)`;
    const [d] = await sql<{ particao: string }[]>`select tableoid::regclass::text as particao from snapshots_bolao where bolao_id = 2`;
    expect(d!.particao).toBe('snapshots_bolao_default');
  });

  it('retenção: remove partições com mais de 90 dias', async () => {
    await sql`select garantir_particoes_snapshots((now() at time zone 'UTC')::date - 120, 2)`;
    expect(await removerParticoesAntigas(sql, 90)).toBe(2);
    expect(await removerParticoesAntigas(sql, 90)).toBe(0);
  });

  it('modalidades semeadas e busca por texto em lotéricas usa trigrama', async () => {
    const [{ n }] = await sql<[{ n: number }]>`select count(*)::int as n from modalidades`;
    expect(n).toBe(10);
    await sql`insert into lotericas (codigo_caixa, nome, cidade, uf) values ('99000001', 'Lotérica Trevo de Ouro', 'Campinas', 'SP')`;
    const r = await sql`select codigo_caixa from lotericas
      where (lower(nome) || ' ' || lower(cidade) || ' ' || codigo_caixa) % 'trevo campinas'`;
    expect(r).toHaveLength(1);
  });

  it('restrições: disponíveis <= total e status válido', async () => {
    const [m] = await sql<{ id: number }[]>`select id from modalidades where slug = 'quina'`;
    const [c] = await sql<{ id: number }[]>`insert into concursos (modalidade_id, numero) values (${m!.id}, 1) returning id`;
    const [l] = await sql<{ id: number }[]>`select id from lotericas limit 1`;
    const inserir = (disp: number, status = 'a_venda') => sql`
      insert into boloes (id_caixa, loterica_id, concurso_id, jogos, dezenas, cotas_total, valor_cota, valor_aposta,
        cotas_disponiveis, first_seen_at, last_seen_at, fila, fila_calculada, pos_entrada_calc_brasil, pos_entrada_calc_uf, pos_entrada_calc_cidade, status)
      values (${'X' + disp + status}, ${l!.id}, ${c!.id}, 1, 6, 10, 1.8, 18, ${disp}, now(), now(), 1, 1, 1, 1, 1, ${status})`;
    await inserir(10);
    await expect(inserir(11)).rejects.toThrow();
    await expect(inserir(5, 'vendido')).rejects.toThrow();
  });
});
