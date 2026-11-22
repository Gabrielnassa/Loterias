import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/** Hash de senha com scrypt (só no servidor). Formato: scrypt$N$r$p$sal$hash (base64). */
const scrypt = promisify(scryptCb) as (senha: string, sal: Buffer, tamanho: number, opcoes: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const N = 16384;
const R = 8;
const P = 1;
const MAXMEM = 64 * 1024 * 1024;

export async function hashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const h = await scrypt(senha.normalize('NFKC'), sal, 64, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, sal.toString('base64'), h.toString('base64')].join('$');
}

export async function conferirSenha(senha: string, guardado: string | null | undefined): Promise<boolean> {
  if (!guardado) return false;
  const [alg, n, r, p, sal, hash] = guardado.split('$');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const h = await scrypt(senha.normalize('NFKC'), Buffer.from(sal, 'base64'), esperado.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM });
  return h.length === esperado.length && timingSafeEqual(h, esperado);
}
