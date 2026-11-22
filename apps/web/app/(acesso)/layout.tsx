import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Entrar', template: '%s · Radar Lotérico' },
  robots: { index: false, follow: false },
};

/** Telas de acesso (entrar, cadastro, convite): sem o menu do painel. */
export default function LayoutAcesso({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Link href="/" className="flex items-center gap-2 self-center text-lg font-semibold">
        <span aria-hidden className="relative inline-block size-6 rounded-full border-2 border-sky-500">
          <span className="absolute inset-1 rounded-full bg-sky-500/60" />
        </span>
        Radar Lotérico
      </Link>
      {children}
    </main>
  );
}
