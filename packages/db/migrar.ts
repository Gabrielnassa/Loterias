import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarSql, type Sql } from './cliente';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Aplica, em ordem, os arquivos migrations/NNNN_*.sql ainda não aplicados.
 * Cada arquivo roda numa transação; o controle fica em _migracoes.
 */
export async function migrar(sql: Sql, log: (msg: string) => void = console.log): Promise<string[]> {
  await sql`create table if not exists _migracoes (nome text primary key, aplicada_em timestamptz not null default now())`;
  const feitas = new Set((await sql<{ nome: string }[]>`select nome from _migracoes`).map((r) => r.nome));
  const arquivos = readdirSync(DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const aplicadas: string[] = [];
  for (const arq of arquivos) {
    if (feitas.has(arq)) continue;
    const ddl = readFileSync(join(DIR, arq), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx`insert into _migracoes (nome) values (${arq})`;
    });
    log(`migração aplicada: ${arq}`);
    aplicadas.push(arq);
  }
  return aplicadas;
}

/** Cria partições diárias de snapshots_bolao para os próximos `dias` dias (idempotente). */
export async function garantirParticoes(sql: Sql, dias = 8): Promise<number> {
  const [r] = await sql<{ n: number }[]>`select garantir_particoes_snapshots((now() at time zone 'UTC')::date - 1, ${dias + 1}) as n`;
  return r?.n ?? 0;
}

/** Remove partições com mais de `manterDias` dias (retenção fina; default 90). */
export async function removerParticoesAntigas(sql: Sql, manterDias = 90): Promise<number> {
  const [r] = await sql<{ n: number }[]>`select remover_particoes_snapshots(${manterDias}) as n`;
  return r?.n ?? 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('defina DATABASE_URL');
    process.exit(1);
  }
  const sql = criarSql(url, { max: 1 });
  migrar(sql)
    .then(async (a) => {
      console.log(a.length ? `${a.length} migração(ões) aplicada(s)` : 'banco já atualizado');
      console.log(`partições criadas: ${await garantirParticoes(sql)}`);
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => sql.end());
}
