import { PRAZO_SESSAO_DIAS } from '@radar/core';
import { COOKIE_SESSAO } from './sessao';

/** Endereço público do sistema (links nos e-mails): RADAR_SITE_URL ou o da própria requisição. */
export function urlBase(req: Request): string {
  const env = process.env.RADAR_SITE_URL?.replace(/\/+$/, '');
  if (env) return env;
  const u = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? u.host;
  const proto = req.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '');
  return `${proto}://${host}`;
}

/** Corpo de formulário (urlencoded ou multipart) ou JSON, como mapa de listas (checkboxes repetem). */
export async function lerCorpo(req: Request): Promise<{ um(k: string): string; varios(k: string): string[] }> {
  const tipo = req.headers.get('content-type') ?? '';
  const mapa = new Map<string, string[]>();
  if (tipo.includes('application/json')) {
    const j = (await req.json()) as Record<string, unknown>;
    for (const [k, v] of Object.entries(j)) mapa.set(k, Array.isArray(v) ? v.map(String) : v === null || v === undefined ? [] : [String(v)]);
  } else {
    const f = await req.formData();
    for (const [k, v] of f.entries()) if (typeof v === 'string') mapa.set(k, [...(mapa.get(k) ?? []), v]);
  }
  return { um: (k) => mapa.get(k)?.[0] ?? '', varios: (k) => mapa.get(k) ?? [] };
}

const querJson = (req: Request) => (req.headers.get('accept') ?? '').includes('application/json');

/**
 * Resposta de uma ação de formulário: JSON para o FormAcao (fetch) ou redirecionamento 303 com a
 * mensagem na consulta (formulário sem JavaScript). Links com token só vão no JSON (nunca na URL).
 */
export function responder(req: Request, voltar: string, r: { ok?: string; erro?: string; link?: string; redirecionar?: string }, cabecalhos: HeadersInit = {}): Response {
  if (querJson(req)) {
    return new Response(JSON.stringify(r), { status: r.erro ? 400 : 200, headers: { 'content-type': 'application/json; charset=utf-8', ...cabecalhos } });
  }
  const destino = new URL(r.redirecionar ?? voltar, urlBase(req));
  if (r.ok) destino.searchParams.set('ok', r.ok);
  if (r.erro) destino.searchParams.set('erro', r.erro);
  const h = new Headers(cabecalhos);
  h.set('location', destino.pathname + destino.search);
  return new Response(null, { status: 303, headers: h });
}

const seguro = (req: Request) => (req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')) === 'https' || process.env.NODE_ENV === 'production';

export function cookieSessao(req: Request, token: string): string {
  return `${COOKIE_SESSAO}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${PRAZO_SESSAO_DIAS * 86_400}${seguro(req) ? '; Secure' : ''}`;
}

export function apagarCookieSessao(req: Request): string {
  return `${COOKIE_SESSAO}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${seguro(req) ? '; Secure' : ''}`;
}

export function tokenDoCookie(req: Request): string | null {
  const c = req.headers.get('cookie') ?? '';
  for (const parte of c.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === COOKIE_SESSAO) return decodeURIComponent(v.join('='));
  }
  return null;
}

export const aparelhoDe = (req: Request) => req.headers.get('user-agent');
