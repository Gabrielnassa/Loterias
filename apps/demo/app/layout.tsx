import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Interceptador } from '@demo/Interceptador';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Radar Lotérico · demonstração', template: '%s · Radar Lotérico (demonstração)' },
  description: 'Demonstração navegável do Radar Lotérico com dados simulados: Raio-X de Abertura, Mercado, Sugestões, site da lotérica e ferramentas.',
  robots: { index: false, follow: false },
  manifest: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/manifest.webmanifest`,
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icones/icone-192.png`, apple: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icones/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: 'Radar', statusBarStyle: 'black-translucent' },
};

export const viewport = { themeColor: '#0c1a2b' };

/** Raiz da demonstração: a faixa fixa avisa que tudo é simulado e calculado no navegador. */
export default function Raiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        <div className="sticky top-0 z-40 bg-amber-400 px-4 py-1.5 text-center text-sm font-semibold text-amber-950 shadow">
          Demonstração com dados simulados · lotéricas fictícias, calculado no seu navegador ·{' '}
          <a className="underline" href="https://github.com/gabrielnassa/Loterias#readme" target="_blank" rel="noopener noreferrer">
            sistema completo no README
          </a>
        </div>
        {children}
        <Interceptador />
      </body>
    </html>
  );
}
