import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Sql = postgres.Sql;
export type Db = ReturnType<typeof criarDb>;

/** Conexão postgres-js. Sempre em UTC; o fuso de negócio (SP) é tratado no código. */
export function criarSql(url: string, opcoes: postgres.Options<Record<string, never>> = {}): Sql {
  return postgres(url, {
    max: 10,
    idle_timeout: 30,
    connection: { TimeZone: 'UTC', application_name: 'radar-loterico' },
    onnotice: () => {},
    ...opcoes,
  });
}

export function criarDb(sql: Sql) {
  return drizzle(sql, { schema });
}
