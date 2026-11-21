import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Radar Lotérico', template: '%s · Radar Lotérico' },
};

/** Raiz: o painel (grupo (painel)) e o site público de cada lotérica ([slug]) têm layouts próprios. */
export default function Raiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
