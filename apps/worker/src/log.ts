import pino from 'pino';

/** Logs estruturados (JSON). Nunca logar dados pessoais de apostadores (LGPD). */
export function criarLog(nivel = 'info') {
  return pino({ level: nivel, base: { app: 'radar-worker' }, timestamp: pino.stdTimeFunctions.isoTime });
}
export type Log = Pick<ReturnType<typeof criarLog>, 'info' | 'warn' | 'error' | 'debug'>;

/** Log silencioso para testes. */
export const logMudo: Log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
