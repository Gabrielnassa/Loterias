import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AvisoDados } from '@/components/Aviso';
import { BuscaLoterica } from '@/components/BuscaLoterica';
import { fonteDeDados } from '@/lib/fonte-dados';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Radar Lotérico', template: '%s · Radar Lotérico' },
  description: 'Raio-X de Abertura: quem abre bolão, quando e em que colocação.',
};

const NAV: [string, string][] = [
  ['/', 'Início'],
  ['/minha', 'Minha lotérica'],
  ['/mercado', 'Mercado'],
  ['/mercado/filas', 'Filas'],
  ['/estatisticas', 'Estatísticas'],
  ['/mega-da-virada', 'Mega da Virada'],
  ['/ranking', 'Ranking'],
  ['/comparar', 'Comparar'],
  ['/ao-vivo', 'Ao vivo'],
];

export default async function Layout({ children }: { children: ReactNode }) {
  const simulado = await fonteDeDados().simulado();
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        <AvisoDados simulado={simulado} />
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
            <div className="ml-auto w-full sm:w-auto">
              <BuscaLoterica />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
