import Link from 'next/link';
import type { ReactNode } from 'react';
import { fonteDeDados } from '@/lib/fonte-dados';

const ABAS: [string, string][] = [
  ['/minha/boloes', 'Bolões MKP'],
  ['/minha/financeiro', 'Financeiro MKP'],
  ['/minha/conferencia', 'Conferência MKP'],
  ['/minha/posicao', 'Posição na abertura'],
];

export default async function LayoutMinha({ children }: { children: ReactNode }) {
  const l = await fonteDeDados().minhaLoterica();
  return (
    <div className="space-y-6">
      <div>
        <div className="rotulo">Minha lotérica</div>
        <h1 className="text-2xl font-semibold">{l ? l.nome : 'Minha lotérica'}</h1>
        {l ? (
          <p className="text-sm text-zinc-500">
            {l.cidade}/{l.uf} · código {l.codigoCaixa}
          </p>
        ) : null}
      </div>
      <nav className="flex flex-wrap gap-4 border-b border-zinc-200 text-sm dark:border-zinc-800" aria-label="Abas da minha lotérica">
        {ABAS.map(([href, t]) => (
          <Link key={href} href={href} className="-mb-px border-b-2 border-transparent pb-2 text-zinc-600 hover:border-sky-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
            {t}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
