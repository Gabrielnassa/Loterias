'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface Item {
  codigoCaixa: string;
  nome: string;
  cidade: string;
  uf: string;
}

/** Busca de lotérica por nome, cidade ou código (GET /api/lotericas?q=). */
export function BuscaLoterica({ grande = false, destino = '/lotericas/' }: { grande?: boolean; destino?: string }) {
  const [q, setQ] = useState('');
  const [itens, setItens] = useState<Item[]>([]);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItens([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/lotericas?q=${encodeURIComponent(q)}&limite=8`, { signal: ctl.signal });
        const j = (await r.json()) as { lotericas: Item[] };
        setItens(j.lotericas);
        setAberto(true);
      } catch {
        /* busca cancelada */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('click', fora);
    return () => document.removeEventListener('click', fora);
  }, []);

  return (
    <div ref={caixa} className={`relative ${grande ? 'w-full max-w-xl' : 'w-full sm:w-72'}`}>
      <label className="sr-only" htmlFor={grande ? 'busca-grande' : 'busca'}>
        Buscar lotérica
      </label>
      <input
        id={grande ? 'busca-grande' : 'busca'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => itens.length && setAberto(true)}
        placeholder="Buscar lotérica: nome, cidade ou código"
        autoComplete="off"
        className={`campo w-full ${grande ? 'px-3 py-2.5 text-base' : ''}`}
      />
      {aberto && q.trim().length >= 2 ? (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-md border border-zinc-200 bg-white text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {itens.length === 0 ? <li className="px-3 py-2 text-zinc-500">Nenhuma lotérica encontrada</li> : null}
          {itens.map((l) => (
            <li key={l.codigoCaixa}>
              <Link
                href={`${destino}${l.codigoCaixa}`}
                onClick={() => setAberto(false)}
                className="flex items-baseline justify-between gap-2 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span className="truncate font-medium">{l.nome}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {l.cidade}/{l.uf} · {l.codigoCaixa}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
