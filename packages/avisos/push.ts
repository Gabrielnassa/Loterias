import webpush from 'web-push';
import type { CargaPush, EnviarPush } from './tipos';

/**
 * Web Push com VAPID (só no servidor). As chaves vêm do ambiente, nunca do repositório:
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_ASSUNTO (mailto:contato@seu-dominio). Gere com
 * `pnpm --filter @radar/avisos vapid`. Sem elas, o container "migrate" gera um par na 1ª subida e guarda no
 * banco (`config_sistema`, ver `@radar/db/config-sistema`); web e worker leem de lá.
 */
export interface ChavesVapid {
  publica: string;
  privada: string;
  assunto: string;
}

/** Assunto VAPID (contato do servidor para os serviços de push): VAPID_ASSUNTO, senão o endereço https do sistema. */
export function assuntoVapid(env: Record<string, string | undefined> = process.env): string {
  if (env.VAPID_ASSUNTO) return env.VAPID_ASSUNTO;
  const site = env.RADAR_SITE_URL?.trim().replace(/\/+$/, '');
  return site && /^https:\/\/[^/]+\.[^/]+/.test(site) ? site : 'mailto:nao-responda@radar.local';
}

export function chavesVapid(env: Record<string, string | undefined> = process.env): ChavesVapid | null {
  const publica = env.VAPID_PUBLIC_KEY;
  const privada = env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return null;
  return { publica, privada, assunto: assuntoVapid(env) };
}

/** Envia o push (TTL de 1 h). 404/410 = inscrição expirada (o aparelho é desativado). */
export function criarEnviarPush(chaves: ChavesVapid | null = chavesVapid()): EnviarPush | null {
  if (!chaves) return null;
  const opcoes = { vapidDetails: { subject: chaves.assunto, publicKey: chaves.publica, privateKey: chaves.privada }, TTL: 3600, urgency: 'high' as const };
  return async (ap, carga: CargaPush) => {
    try {
      await webpush.sendNotification({ endpoint: ap.endpoint, keys: { p256dh: ap.p256dh, auth: ap.auth } }, JSON.stringify(carga), opcoes);
      return 'ok';
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      return status === 404 || status === 410 ? 'expirado' : 'falha';
    }
  };
}

export function gerarChavesVapid(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}
