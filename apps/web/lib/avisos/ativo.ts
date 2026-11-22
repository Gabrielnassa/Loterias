import { RepositorioAvisosMemoria } from '@radar/avisos/memoria';
import { RepositorioAvisosPostgres } from '@radar/avisos/postgres';
import type { RepositorioAvisos } from '@radar/avisos/tipos';
import { criarSql } from '@radar/db';
import { modoContas, repositorioContas } from '@/lib/contas/ativo';
import type { RepositorioContasMemoria } from '@/lib/contas/memoria';
import { membrosDaMemoria } from './membros';

export { membrosDaMemoria };

/** Monitoradas, aparelhos e notificações: Postgres ou memória (mesmo modo das contas). */
const GLOBAL = globalThis as unknown as { __radarAvisos?: RepositorioAvisos };

export function repositorioAvisos(): RepositorioAvisos | null {
  const modo = modoContas();
  if (modo === 'desligado') return null;
  if (!GLOBAL.__radarAvisos || GLOBAL.__radarAvisos.tipo !== modo) {
    GLOBAL.__radarAvisos =
      modo === 'postgres'
        ? new RepositorioAvisosPostgres(criarSql(process.env.DATABASE_URL!, { max: 3 }))
        : new RepositorioAvisosMemoria(membrosDaMemoria(repositorioContas() as RepositorioContasMemoria));
  }
  return GLOBAL.__radarAvisos;
}

/** Chave pública VAPID (vai para o navegador assinar o push). null = Web Push desligado. */
export function chavePublicaVapid(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function definirRepositorioAvisos(r: RepositorioAvisos | undefined) {
  GLOBAL.__radarAvisos = r;
}
