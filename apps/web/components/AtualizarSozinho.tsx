'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Recarrega os dados da página a cada `segundos` (o Monitoramento acompanha a vitrine). */
export function AtualizarSozinho({ segundos = 60 }: { segundos?: number }) {
  const router = useRouter();
  const [ultima, setUltima] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
      setUltima(new Date());
    }, segundos * 1000);
    return () => clearInterval(id);
  }, [router, segundos]);
  return (
    <span className="text-xs text-zinc-500" suppressHydrationWarning>
      atualiza a cada {segundos} s · última {ultima.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
    </span>
  );
}
