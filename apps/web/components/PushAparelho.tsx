'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function chaveParaBytes(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + pad).replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function nomeDoAparelho(): string {
  const ua = navigator.userAgent;
  const so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'aparelho';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
  return `${nav} no ${so}`;
}

type Estado = 'carregando' | 'sem-suporte' | 'negado' | 'desligado' | 'ligado' | 'sem-servidor';

/**
 * "Este aparelho": liga o Web Push (pede a permissão, assina com a chave VAPID do servidor e registra a
 * inscrição) e manda um push de teste. As preferências de cada aparelho ficam na lista abaixo.
 */
export function PushAparelho({ chavePublica, aparelhos }: { chavePublica: string | null; aparelhos: { id: string; endpoint: string }[] }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>('carregando');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent);
  const instalado = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;

  useEffect(() => {
    (async () => {
      if (!chavePublica) return setEstado('sem-servidor');
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setEstado('sem-suporte');
      if (Notification.permission === 'denied') return setEstado('negado');
      const reg = await navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` });
      const sub = await reg.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
      setEstado(sub && aparelhos.some((a) => a.endpoint === sub.endpoint) ? 'ligado' : 'desligado');
    })().catch(() => setEstado('sem-suporte'));
  }, [chavePublica, aparelhos]);

  async function ligar() {
    setMsg(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') return setEstado(permissao === 'denied' ? 'negado' : 'desligado');
      const reg = await navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chavePublica!) as BufferSource }));
      const r = await fetch(`${BASE}/api/push`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'inscrever', inscricao: sub.toJSON(), nome: nomeDoAparelho() }) });
      const j = (await r.json()) as { ok?: string; erro?: string };
      setMsg(j);
      if (r.ok) {
        setEndpoint(sub.endpoint);
        setEstado('ligado');
        router.refresh();
        window.dispatchEvent(new Event('demo:atualizar'));
      }
    } catch (e) {
      setMsg({ erro: (e as Error).message });
    }
  }

  async function testar() {
    setMsg(null);
    const r = await fetch(`${BASE}/api/push`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'testar', endpoint }) });
    setMsg((await r.json()) as { ok?: string; erro?: string });
  }

  return (
    <div className="space-y-2 text-sm">
      {estado === 'carregando' ? <p className="text-zinc-500">Verificando este aparelho…</p> : null}
      {estado === 'sem-servidor' ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {process.env.NEXT_PUBLIC_DEMO === '1'
            ? 'Na demonstração estática o push fica desligado (precisa do servidor com as chaves VAPID). As preferências abaixo são de um aparelho de exemplo e ficam salvas neste navegador.'
            : 'O push está desligado neste servidor (faltam as chaves VAPID). As notificações continuam chegando aqui na central.'}
        </p>
      ) : null}
      {estado === 'sem-suporte' ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          Este navegador não recebe push.{' '}
          {ios && !instalado ? 'No iPhone, toque em Compartilhar › Adicionar à Tela de Início e abra o Radar por lá.' : 'Use o Chrome, o Edge, o Firefox ou o Safari atualizado.'}
        </p>
      ) : null}
      {estado === 'negado' ? <p className="text-amber-700 dark:text-amber-400">As notificações foram bloqueadas neste navegador. Libere nas configurações do site e recarregue.</p> : null}
      {estado === 'desligado' ? (
        <button type="button" className="botao" onClick={ligar}>
          Ligar notificações neste aparelho
        </button>
      ) : null}
      {estado === 'ligado' ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-emerald-700 dark:text-emerald-400">Este aparelho recebe push.</span>
          <button type="button" className="botao" onClick={testar}>
            Enviar um teste
          </button>
        </div>
      ) : null}
      {msg?.erro ? <p className="text-red-600 dark:text-red-400">{msg.erro}</p> : null}
      {msg?.ok ? <p className="text-emerald-700 dark:text-emerald-400">{msg.ok}</p> : null}
      {endpoint ? <span data-endpoint-atual={endpoint} hidden /> : null}
    </div>
  );
}
