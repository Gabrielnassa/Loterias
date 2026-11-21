import { criarSql } from './cliente';

/**
 * Para testes de integração: recria do zero o banco `nome` no mesmo servidor de `urlBase`
 * e devolve a URL dele. Cada suíte usa o seu banco, então podem rodar em paralelo.
 * Exige papel com CREATEDB (o superusuário do docker-compose tem).
 */
export async function recriarBancoDeTeste(urlBase: string, nome: string): Promise<string> {
  if (!/^[a-z_][a-z0-9_]*$/.test(nome)) throw new Error(`nome de banco inválido: ${nome}`);
  const admin = criarSql(urlBase, { max: 1 });
  try {
    await admin.unsafe(`drop database if exists ${nome} with (force)`);
    await admin.unsafe(`create database ${nome}`);
  } finally {
    await admin.end();
  }
  const u = new URL(urlBase);
  u.pathname = `/${nome}`;
  return u.toString();
}
