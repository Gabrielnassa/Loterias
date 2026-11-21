'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Estorno manual: o usuário marca e desmarca (SPEC). */
export function EstornoBotao({ id, estornado }: { id: number; estornado: boolean }) {
  const [ocupado, setOcupado] = useState(false);
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={ocupado}
      className="text-xs text-zinc-500 underline-offset-2 hover:underline disabled:opacity-50"
      onClick={async () => {
        if (!estornado && !confirm('Marcar este bolão como estornado (cancelado)? Ele sai do financeiro.')) return;
        setOcupado(true);
        await fetch(`/api/minha/boloes/${id}/estorno`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ estornado: !estornado }) });
        setOcupado(false);
        router.refresh();
      }}
    >
      {estornado ? 'desmarcar estorno' : 'estornar'}
    </button>
  );
}
