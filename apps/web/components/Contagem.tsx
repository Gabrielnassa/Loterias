'use client';

import { useEffect, useState } from 'react';

function partes(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86_400), h: Math.floor((s % 86_400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Contagem regressiva até `alvo` (ISO). `alertaEm`: ms antes do alvo em que fica em destaque. */
export function Contagem({ alvo, rotulo, alertaEm }: { alvo: string; rotulo?: string; alertaEm?: number }) {
  const t = new Date(alvo).getTime();
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (agora === null) return <span className="tabular text-2xl font-semibold">—</span>;
  const falta = t - agora;
  const p = partes(falta);
  const alerta = alertaEm !== undefined && falta > 0 && falta <= alertaEm;
  return (
    <span className={`tabular text-2xl font-semibold ${alerta ? 'animate-pulse text-rose-600 dark:text-rose-400' : ''}`} role="timer" aria-live="off">
      {rotulo ? <span className="mr-2 text-sm font-normal text-zinc-500">{rotulo}</span> : null}
      {falta <= 0 ? 'agora' : `${p.d ? `${p.d}d ` : ''}${String(p.h).padStart(2, '0')}:${String(p.m).padStart(2, '0')}:${String(p.s).padStart(2, '0')}`}
    </span>
  );
}
