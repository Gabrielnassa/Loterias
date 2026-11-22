/**
 * Tokens aleatórios (link mágico, convite, sessão) e o hash SHA-256 que vai para o banco.
 * Web Crypto: roda no Node (servidor) e no navegador (demonstração).
 */
export function novoToken(bytes = 32): string {
  const b = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<string> {
  const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
