import Link from 'next/link';
import type { ReactNode } from 'react';
import { BuscaLoterica } from '@/components/BuscaLoterica';

const NAV: [string, string][] = [
  ['/', 'Início'],
  ['/minha/sugestoes', 'Minha lotérica'],
  ['/mercado', 'Mercado'],
  ['/mercado/filas', 'Filas'],
  ['/estatisticas', 'Estatísticas'],
  ['/mega-da-virada', 'Mega da Virada'],
  ['/ranking', 'Ranking'],
  ['/elite', 'Elite e Top'],
  ['/comparar', 'Comparar'],
  ['/ao-vivo', 'Ao vivo'],
  ['/calendario', 'Calendário'],
  ['/simulador', 'Simulador'],
  ['/loteca', 'Loteca'],
  ['/equipe', 'Equipe'],
  ['/loterica-trevo-de-ouro', 'Site de exemplo'],
];

export default function LayoutPainel({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span aria-hidden className="relative inline-block size-5 rounded-full border-2 border-sky-500">
              <span className="absolute inset-1 rounded-full bg-sky-500/60" />
            </span>
            Radar Lotérico
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV.map(([href, t]) => (
              <Link key={href} href={href} className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
                {t}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <BuscaLoterica />
            <Link href="/conta" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white" title="Na demonstração você é o responsável de uma conta de exemplo">
              Você <span className="text-zinc-400">· responsável</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
