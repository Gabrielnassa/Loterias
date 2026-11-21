/**
 * Busca e grava o resultado oficial de um concurso (Conferência MKP).
 *   DATABASE_URL=... pnpm resultados -- --modalidade mega-sena --concurso 3088
 */
import { ehModalidade } from '@radar/core';
import { criarDb, criarSql, migrar } from '@radar/db';
import { criarBuscaResultados } from './fontes/resultados-caixa';
import { RepositorioPostgres } from './repositorio/postgres';

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function principal() {
  const modalidade = arg('modalidade');
  const concurso = Number(arg('concurso'));
  if (!modalidade || !ehModalidade(modalidade) || !Number.isInteger(concurso)) throw new Error('use --modalidade mega-sena --concurso 3088');
  const r = await criarBuscaResultados()({ modalidade, concurso });
  if (!r) throw new Error('resultado ainda não publicado');
  console.log(`${modalidade} ${concurso} (${r.resultado.dataApuracao}): ${r.resultado.dezenas.join(' ')}`);
  for (const x of r.resultado.rateios) console.log(`  ${x.descricao}: ${x.ganhadores} ganhadores, R$ ${x.valorPremio.toFixed(2)}`);
  if (!process.env.DATABASE_URL) return console.log('(sem DATABASE_URL: não gravado)');
  const sql = criarSql(process.env.DATABASE_URL, { max: 2 });
  try {
    await migrar(sql, () => {});
    await new RepositorioPostgres(criarDb(sql)).salvarResultado({ modalidade, concurso }, r.resultado, r.bruto);
    console.log('gravado no banco');
  } finally {
    await sql.end();
  }
}

principal().catch((e) => {
  console.error(`${e?.name ?? 'Erro'}: ${e?.message ?? e}`);
  process.exit(1);
});
