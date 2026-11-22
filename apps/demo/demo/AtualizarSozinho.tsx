'use client';

import { useEffect, useState } from 'react';

/** Na demonstração, "atualizar" = recalcular a tela no navegador (evento escutado por demo/Rota.tsx). */
export function AtualizarSozinho({ segundos = 60 }: { segundos?: number }) {
  const [ultima, setUltima] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      window.dispatchEvent(new Event('demo:atualizar'));
      setUltima(new Date());
    }, segundos * 1000);
    return () => clearInterval(id);
  }, [segundos]);
  return (
    <span className="text-xs text-zinc-500" suppressHydrationWarning>
      recalcula a cada {segundos} s · última {ultima.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
    </span>
  );
}
