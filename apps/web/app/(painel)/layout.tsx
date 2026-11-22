import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AvisoDados } from '@/components/Aviso';
import { BuscaLoterica } from '@/components/BuscaLoterica';
import { RegistrarSW } from '@/components/RegistrarSW';
import { repositorioAvisos } from '@/lib/avisos/ativo';
import { NOME_PAPEL, telaDaRota } from '@radar/core';
import { contexto } from '@/lib/contexto';
import { fonteDeDados } from '@/lib/fonte-dados';

export const metadata: Metadata = {
  title: { default: 'Radar Lotérico', template: '%s · Radar Lotérico' },
  description: 'Raio-X de Abertura: quem abre bolão, quando e em que colocação.',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icones/icone-192.png', apple: '/icones/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Radar', statusBarStyle: 'black-translucent' },
};

export const viewport = { themeColor: '#0c1a2b' };

const NAV: [string, string][] = [
  ['/', 'Início'],
  ['/minha', 'Minha lotérica'],
  ['/mercado', 'Mercado'],
  ['/mercado/filas', 'Filas'],
  ['/estatisticas', 'Estatísticas'],
  ['/mega-da-virada', 'Mega da Virada'],
  ['/ranking', 'Ranking'],
  ['/elite', 'Elite e Top'],
  ['/monitoradas', 'Monitoradas'],
  ['/comparar', 'Comparar'],
  ['/ao-vivo', 'Ao vivo'],
  ['/calendario', 'Calendário'],
  ['/simulador', 'Simulador'],
  ['/loteca', 'Loteca'],
  ['/gestao', 'Gestão'],
  ['/equipe', 'Equipe'],
  ['/planos', 'Plano'],
];

export default async function LayoutPainel({ children }: { children: ReactNode }) {
  const [simulado, ctx] = await Promise.all([fonteDeDados().simulado(), contexto()]);
  const avisos = ctx ? repositorioAvisos() : null;
  const naoLidas = ctx && avisos ? await avisos.naoLidas(ctx.usuario.id).catch(() => 0) : 0;
  // com contas ligadas, o menu mostra só as telas liberadas para a pessoa
  const nav = NAV.filter(([href]) => {
    if (!ctx) return href !== '/equipe' && href !== '/monitoradas' && href !== '/planos' && href !== '/gestao';
    if (href === '/minha') return ctx.telas.some((t) => t.startsWith('minha-'));
    if (href === '/gestao') return ctx.telas.some((t) => t.startsWith('gestao-'));
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
                <Link key={href} href={href === '/gestao' && ctx && !ctx.telas.includes('gestao-financeiro') ? (ctx.telas.includes('gestao-caixa') ? '/gestao/caixas' : '/gestao/fiados') : href} className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
                  {t}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex w-full flex-wrap items-center gap-3 sm:w-auto">
              {!ctx || ctx.telas.includes('raio-x') ? <BuscaLoterica /> : null}
              {ctx ? (
                <div className="flex items-center gap-3 text-sm">
                  <Link href="/notificacoes" className="relative text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white" title="Notificações">
                    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                    <span className="sr-only">Notificações</span>
                    {naoLidas ? <span className="absolute -right-2 -top-1.5 rounded-full bg-sky-600 px-1 text-[10px] leading-4 text-white tabular">{naoLidas > 99 ? '99+' : naoLidas}</span> : null}
                  </Link>
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
        {ctx?.plano && (ctx.plano.aviso || ctx.plano.motivo === 'teste') && ctx.telas.includes('plano') ? (
          <div className={`px-4 py-1.5 text-center text-xs ${ctx.plano.aviso ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200' : 'bg-sky-50 text-sky-900 dark:bg-sky-500/10 dark:text-sky-200'}`}>
            {ctx.plano.aviso ?? `Teste grátis com tudo liberado: faltam ${ctx.plano.diasRestantesTeste} ${ctx.plano.diasRestantesTeste === 1 ? 'dia' : 'dias'}.`}{' '}
            <Link className="underline" href="/planos">
              Ver planos
            </Link>
          </div>
        ) : null}
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <RegistrarSW />
    </>
  );
}
