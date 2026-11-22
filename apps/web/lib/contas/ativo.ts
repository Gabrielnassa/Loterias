import { criarSql } from '@radar/db';
import { estadoVazio, RepositorioContasMemoria } from './memoria';
import { RepositorioContasPostgres } from './postgres';
import type { RepositorioContas } from './tipos';

/**
 * Contas ligadas? RADAR_AUTH = desligado | memoria | postgres. Sem a variável: postgres se houver
 * DATABASE_URL; senão desligado (o painel abre sem login, como antes, com RADAR_MINHA_LOTERICA).
 * "memoria" serve para testar o login sem banco (some ao reiniciar).
 */
export type ModoContas = 'desligado' | 'memoria' | 'postgres';

export function modoContas(): ModoContas {
  const v = process.env.RADAR_AUTH;
  if (v === 'desligado' || v === 'memoria' || v === 'postgres') return v;
  return process.env.DATABASE_URL ? 'postgres' : 'desligado';
}

const GLOBAL = globalThis as unknown as { __radarContas?: RepositorioContas };

export function repositorioContas(): RepositorioContas | null {
  const modo = modoContas();
  if (modo === 'desligado') return null;
  if (!GLOBAL.__radarContas || GLOBAL.__radarContas.tipo !== modo) {
    GLOBAL.__radarContas = modo === 'postgres' ? new RepositorioContasPostgres(criarSql(process.env.DATABASE_URL!, { max: 5 })) : new RepositorioContasMemoria(estadoVazio());
  }
  return GLOBAL.__radarContas;
}

/** Para testes: injeta um repositório. */
export function definirRepositorioContas(r: RepositorioContas | undefined) {
  GLOBAL.__radarContas = r;
}
