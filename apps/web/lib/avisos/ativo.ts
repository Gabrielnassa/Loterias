import { RepositorioAvisosMemoria } from '@radar/avisos/memoria';
import { RepositorioAvisosPostgres } from '@radar/avisos/postgres';
import { assuntoVapid, chavesVapid, type ChavesVapid } from '@radar/avisos/push';
import type { RepositorioAvisos } from '@radar/avisos/tipos';
import { criarSql } from '@radar/db';
import { chavesVapidSalvas } from '@radar/db/config-sistema';
import { modoContas, repositorioContas } from '@/lib/contas/ativo';
import type { RepositorioContasMemoria } from '@/lib/contas/memoria';
import { membrosDaMemoria } from './membros';

export { membrosDaMemoria };

/** Monitoradas, aparelhos e notificações: Postgres ou memória (mesmo modo das contas). */
const GLOBAL = globalThis as unknown as { __radarAvisos?: RepositorioAvisos; __radarVapid?: ChavesVapid; __radarVapidSql?: ReturnType<typeof criarSql> };

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

/**
 * Chaves do Web Push: as do ambiente (VAPID_*) ou, sem elas, as que o container "migrate" gerou e guardou no
 * banco (Docker Manager, sem terminal no servidor). null = Web Push desligado.
 */
export async function chavesVapidServidor(): Promise<ChavesVapid | null> {
  const doAmbiente = chavesVapid();
  if (doAmbiente) return doAmbiente;
  if (GLOBAL.__radarVapid) return GLOBAL.__radarVapid;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  GLOBAL.__radarVapidSql ??= criarSql(url, { max: 1 });
  const salvas = await chavesVapidSalvas(GLOBAL.__radarVapidSql);
  if (!salvas) return null; // ainda não geradas: tenta de novo na próxima vez
  GLOBAL.__radarVapid = { publica: salvas.publica, privada: salvas.privada, assunto: assuntoVapid() };
  return GLOBAL.__radarVapid;
}

/** Chave pública VAPID (vai para o navegador assinar o push). null = Web Push desligado. */
export async function chavePublicaVapid(): Promise<string | null> {
  return (await chavesVapidServidor())?.publica ?? null;
}

export function definirRepositorioAvisos(r: RepositorioAvisos | undefined) {
  GLOBAL.__radarAvisos = r;
}
