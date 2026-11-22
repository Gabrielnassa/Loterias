import { generateKeyPairSync } from 'node:crypto';
import type { Sql } from './cliente';

/** Configuração gerada pelo sistema (tabela config_sistema). */
export async function lerConfigSistema(sql: Sql, chave: string): Promise<string | null> {
  const [r] = await sql<{ valor: string }[]>`select valor from config_sistema where chave = ${chave}`;
  return r?.valor ?? null;
}

/** Grava só se ainda não existir (vários containers podem subir juntos). Devolve o valor que ficou. */
export async function gravarConfigSistemaSeVazio(sql: Sql, chave: string, valor: string): Promise<string> {
  await sql`insert into config_sistema (chave, valor) values (${chave}, ${valor}) on conflict (chave) do nothing`;
  return (await lerConfigSistema(sql, chave))!;
}

const b64url = (b: Buffer) => b.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

/** Par de chaves VAPID (P-256): pública = ponto não comprimido (65 bytes), privada = d (32 bytes), em base64url. */
export function gerarParVapid(): { publica: string; privada: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  const ponto = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x!, 'base64url'), Buffer.from(pub.y!, 'base64url')]);
  return { publica: b64url(ponto), privada: b64url(Buffer.from(priv.d!, 'base64url')) };
}

export interface ChavesVapidSistema {
  publica: string;
  privada: string;
  origem: 'ambiente' | 'banco';
}

/**
 * Chaves do Web Push: as do ambiente (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY) ou, sem elas, as geradas na
 * 1ª subida e guardadas no banco (o par fica fixo: trocar invalida os aparelhos inscritos).
 */
export async function garantirChavesVapid(sql: Sql, env: Record<string, string | undefined> = process.env): Promise<ChavesVapidSistema> {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publica: env.VAPID_PUBLIC_KEY, privada: env.VAPID_PRIVATE_KEY, origem: 'ambiente' };
  const existente = await lerConfigSistema(sql, 'vapid');
  if (existente) return { ...(JSON.parse(existente) as { publica: string; privada: string }), origem: 'banco' };
  const par = gerarParVapid();
  const salvo = await gravarConfigSistemaSeVazio(sql, 'vapid', JSON.stringify(par));
  return { ...(JSON.parse(salvo) as { publica: string; privada: string }), origem: 'banco' };
}

/** Lê as chaves sem criar (web e worker): ambiente primeiro, depois o banco. */
export async function chavesVapidSalvas(sql: Sql, env: Record<string, string | undefined> = process.env): Promise<ChavesVapidSistema | null> {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publica: env.VAPID_PUBLIC_KEY, privada: env.VAPID_PRIVATE_KEY, origem: 'ambiente' };
  const v = await lerConfigSistema(sql, 'vapid').catch(() => null);
  return v ? { ...(JSON.parse(v) as { publica: string; privada: string }), origem: 'banco' } : null;
}
