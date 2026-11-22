'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BASE } from './preparar';

/**
 * Faz os links e formulários das telas do apps/web funcionarem num site estático:
 * - links internos sem o prefixo /Loterias navegam pelo roteador (sem recarregar a página);
 * - formulários GET viram navegação com a consulta;
 * - exportar CSV/Excel, baixar artes e gravar (POST) precisam do servidor: mostra um aviso.
 */
export function Interceptador() {
  const router = useRouter();
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    const mostrar = (m: string) => {
      setAviso(m);
      window.setTimeout(() => setAviso(null), 5000);
    };
    const onAviso = (e: Event) => mostrar(String((e as CustomEvent).detail));
    const interno = (href: string) => href.startsWith('/') && !href.startsWith('//') && !(BASE && (href === BASE || href.startsWith(`${BASE}/`)));
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      const href = a?.getAttribute('href');
      if (!a || !href || !interno(href)) return;
      e.preventDefault();
      if (href.startsWith('/api/')) {
        mostrar('Exportar CSV/Excel e baixar arquivos precisa do servidor; na demonstração estática fica desligado.');
        return;
      }
      if (a.target === '_blank') window.open(`${BASE}${href}`, '_blank', 'noopener');
      else router.push(href);
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      const acao = f.getAttribute('action') ?? '';
      if (acao.startsWith('/api/') || (f.method ?? 'get').toLowerCase() === 'post') {
        e.preventDefault();
        mostrar('Gravar dados precisa do servidor e do banco; na demonstração estática não grava nada.');
        return;
      }
      e.preventDefault();
      const q = new URLSearchParams();
      for (const [k, v] of new FormData(f).entries()) if (typeof v === 'string' && v !== '') q.append(k, v);
      const destino = acao && interno(acao) ? acao : window.location.pathname.slice(BASE.length) || '/';
      router.push(`${destino}${q.size ? `?${q}` : ''}`);
    };
    window.addEventListener('demo:aviso', onAviso);
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      window.removeEventListener('demo:aviso', onAviso);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, [router]);
  return aviso ? (
    <div role="status" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-lg bg-zinc-900 px-4 py-3 text-sm text-white shadow-xl dark:bg-zinc-100 dark:text-zinc-900">
      {aviso}
    </div>
  ) : null;
}
