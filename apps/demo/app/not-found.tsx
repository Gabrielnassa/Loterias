import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Página não encontrada' };

/** 404 da demonstração estática (vira out/404.html; o .htaccess aponta o ErrorDocument para ela). */
export default function NaoEncontrada() {
  return (
    <main className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="text-5xl font-bold text-amber-500">404</p>
      <h1 className="mt-4 text-xl font-semibold">Página não encontrada</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Este endereço não existe na demonstração. Talvez o link esteja incompleto ou a tela tenha mudado de lugar.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
        <Link href="/" className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          Ir para o início
        </Link>
        <Link href="/ranking/" className="rounded-md border border-zinc-300 px-4 py-2 dark:border-zinc-700">
          Ranking da abertura
        </Link>
        <Link href="/mercado/" className="rounded-md border border-zinc-300 px-4 py-2 dark:border-zinc-700">
          Mercado
        </Link>
      </div>
    </main>
  );
}
