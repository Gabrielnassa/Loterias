/* Radar Lotérico: service worker do painel (PWA instalável + Web Push). Sem cache de dados: a vitrine
   muda a cada segundo; sem conexão, mostra uma página simples. */
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const SEM_CONEXAO =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title>' +
  '<body style="font-family:system-ui,sans-serif;padding:2rem;background:#0c1a2b;color:#e2e8f0"><h1>Sem conexão</h1>' +
  '<p>O Radar Lotérico precisa de internet para ler a vitrine. Tente de novo em instantes.</p></body>';

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(SEM_CONEXAO, { headers: { 'content-type': 'text/html; charset=utf-8' } })));
});

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { corpo: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || 'Radar Lotérico', {
      body: d.corpo || '',
      tag: d.chave || undefined,
      data: { url: BASE + (d.url || '/notificacoes') },
      icon: BASE + '/icones/icone-192.png',
      badge: BASE + '/icones/badge-96.png',
      lang: 'pt-BR',
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || BASE + '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if ('focus' in j && new URL(j.url).pathname.startsWith(BASE || '/')) {
          if ('navigate' in j) j.navigate(url).catch(() => {});
          return j.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
