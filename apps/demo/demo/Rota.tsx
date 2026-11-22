'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { prepararDemo } from './preparar';
import { carregarRota, type ChaveRota } from './rotas';

function Carregando({ texto = 'Calculando no seu navegador…' }: { texto?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 text-sm text-zinc-500" role="status">
      <span className="inline-block size-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      {texto}
    </div>
  );
}

/**
 * Executa a página do apps/web no navegador: a mesma função que no servidor monta a tela com os
 * dados (aqui, a fonte simulada do build). Erros viram uma tela explicando, nunca uma página quebrada.
 */
function Executar({ rota, params }: { rota: ChaveRota; params: Record<string, string> }) {
  const sp = useSearchParams();
  const router = useRouter();
  const consulta = sp.toString();
  const chaveParams = JSON.stringify(params);
  const [tick, setTick] = useState(0);
  const [estado, setEstado] = useState<{ no?: ReactNode; erro?: string; naoEncontrado?: boolean; carregando: boolean }>({ carregando: true });
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    window.addEventListener('demo:atualizar', f);
    return () => window.removeEventListener('demo:atualizar', f);
  }, []);
  useEffect(() => {
    let vivo = true;
    if (tick === 0) setEstado({ carregando: true });
    (async () => {
      await prepararDemo();
      const { pagina, layout } = await carregarRota(rota);
      const busca = Object.fromEntries(new URLSearchParams(consulta).entries());
      let no = await pagina({ params: Promise.resolve(JSON.parse(chaveParams) as Record<string, string>), searchParams: Promise.resolve(busca) });
      if (layout) no = await layout({ children: no });
      if (vivo) setEstado({ no, carregando: false });
    })().catch((e: unknown) => {
      if (!vivo) return;
      const digest = String((e as { digest?: string })?.digest ?? '');
      if (digest.startsWith('NEXT_REDIRECT')) {
        router.replace(digest.split(';')[2] ?? '/');
        return;
      }
      if (digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;404') || digest === 'NEXT_NOT_FOUND') setEstado({ naoEncontrado: true, carregando: false });
      else setEstado({ erro: e instanceof Error ? e.message : String(e), carregando: false });
    });
    return () => {
      vivo = false;
    };
  }, [rota, consulta, chaveParams, tick, router]);
  if (estado.carregando) return <Carregando />;
  if (estado.naoEncontrado) return <div className="cartao py-10 text-center text-sm">Não encontrado nos dados da demonstração.</div>;
  if (estado.erro) {
    return (
      <div className="cartao space-y-2 border-amber-300 dark:border-amber-700">
        <h2 className="font-semibold">Esta tela não rodou na demonstração estática</h2>
        <p className="text-sm">Ela depende de algo que só existe no servidor. No sistema completo funciona normalmente.</p>
        <p className="font-mono text-xs text-zinc-500">{estado.erro}</p>
      </div>
    );
  }
  return <>{estado.no}</>;
}

export function Rota({ rota, params = {} }: { rota: ChaveRota; params?: Record<string, string> }) {
  return (
    <Suspense fallback={<Carregando texto="Carregando…" />}>
      <Executar rota={rota} params={params} />
    </Suspense>
  );
}
