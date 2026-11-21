'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

interface Loja {
  codigoCaixa: string;
  nome: string;
  cidade: string;
  uf: string;
  semDados?: boolean;
}

/** Abas de loja (multi-loja) e de tela da "Minha lotérica", preservando a loja escolhida (?loja=). */
export function SeletorLoja({ lojas, abas }: { lojas: Loja[]; abas: [string, string][] }) {
  const caminho = usePathname();
  const params = useSearchParams();
  const atual = params.get('loja')?.replace(/\D/g, '').replace(/^0+/, '') || lojas[0]?.codigoCaixa;
  const loja = lojas.find((l) => l.codigoCaixa === atual) ?? lojas[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="rotulo">Minha lotérica</div>
          <h1 className="text-2xl font-semibold">{loja?.nome ?? 'Minha lotérica'}</h1>
          {loja ? (
            <p className="text-sm text-zinc-500">
              {loja.cidade ? `${loja.cidade}/${loja.uf} · ` : ''}código {loja.codigoCaixa}
              {loja.semDados ? ' · ainda sem dados: o coletor não viu bolões desta lotérica' : ''}
            </p>
          ) : null}
        </div>
        {lojas.length > 1 ? (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lojas">
            {lojas.map((l) => (
              <Link
                key={l.codigoCaixa}
                href={`${caminho}?loja=${l.codigoCaixa}`}
                className={`botao ${l.codigoCaixa === loja?.codigoCaixa ? 'ring-2 ring-sky-500' : ''}`}
              >
                {l.nome}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <nav className="flex flex-wrap gap-4 border-b border-zinc-200 text-sm dark:border-zinc-800" aria-label="Abas da minha lotérica">
        {abas.map(([href, t]) => (
          <Link
            key={href}
            href={loja ? `${href}?loja=${loja.codigoCaixa}` : href}
            className={`-mb-px border-b-2 pb-2 ${caminho === href ? 'border-sky-500 font-medium' : 'border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'}`}
          >
            {t}
          </Link>
        ))}
      </nav>
    </div>
  );
}
