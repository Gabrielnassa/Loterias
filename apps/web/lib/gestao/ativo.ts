import { criarSql } from '@radar/db';
import { modoContas } from '@/lib/contas/ativo';
import { RepositorioGestaoMemoria, RepositorioGestaoPostgres, type RepositorioGestao } from './repositorio';

/** Gestão da loja: Postgres ou memória (mesmo modo das contas; sem contas, desligada). */
const GLOBAL = globalThis as unknown as { __radarGestao?: RepositorioGestao };

export function repositorioGestao(): RepositorioGestao | null {
  const modo = modoContas();
  if (modo === 'desligado') return null;
  if (!GLOBAL.__radarGestao || GLOBAL.__radarGestao.tipo !== modo) {
    GLOBAL.__radarGestao = modo === 'postgres' ? new RepositorioGestaoPostgres(criarSql(process.env.DATABASE_URL!, { max: 3 })) : new RepositorioGestaoMemoria();
  }
  return GLOBAL.__radarGestao;
}

export function definirRepositorioGestao(r: RepositorioGestao | undefined) {
  GLOBAL.__radarGestao = r;
}
