import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AvisoDados } from '@/components/Aviso';
import { BuscaLoterica } from '@/components/BuscaLoterica';
import { NOME_PAPEL, telaDaRota } from '@radar/core';
import { contexto } from '@/lib/contexto';
import { fonteDeDados } from '@/lib/fonte-dados';

export const metadata: Metadata = {
  title: { default: 'Radar Lotérico', template: '%s · Radar Lotérico' },
  description: 'Raio-X de Abertura: quem abre bolão, quando e em que colocação.',
  robots: { index: false, follow: false },
};

const NAV: [string, string][] = [
  ['/', 'Início'],
  ['/minha', 'Minha lotérica'],
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
];

export default async function LayoutPainel({ children }: { children: ReactNode }) {
  const [simulado, ctx] = await Promise.all([fonteDeDados().simulado(), contexto()]);
  // com contas ligadas, o menu mostra só as telas liberadas para a pessoa
  const nav = NAV.filter(([href]) => {
    if (!ctx) return href !== '/equipe';
    if (href === '/minha') return ctx.telas.some((t) => t.startsWith('minha-'));
    const t = telaDaRota(href);
    return !t || ctx.telas.includes(t.id);
  });
  return (
    <>
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
              {nav.map(([href, t]) => (
                <Link key={href} href={href} className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
                  {t}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex w-full flex-wrap items-center gap-3 sm:w-auto">
              {!ctx || ctx.telas.includes('raio-x') ? <BuscaLoterica /> : null}
              {ctx ? (
                <div className="flex items-center gap-3 text-sm">
                  <Link href="/conta" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white" title={ctx.usuario.email}>
                    {ctx.usuario.nome.split(' ')[0]}
                    {ctx.conta ? (
                      <span className="text-zinc-400">
                        {' '}
                        · {ctx.conta.nome}
                        {ctx.papel ? ` (${NOME_PAPEL[ctx.papel].toLowerCase()})` : ''}
                      </span>
                    ) : null}
                  </Link>
                  <form method="post" action="/api/auth/sair">
                    <button type="submit" className="text-zinc-500 underline-offset-2 hover:underline">
                      Sair
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
