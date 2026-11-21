import Link from 'next/link';

/** Abas como links (mantêm os outros parâmetros da URL). */
export function Abas({ abas, ativa, base, params }: { abas: [string, string][]; ativa: string; base: string; params: Record<string, string> }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-800" aria-label="Abas">
      {abas.map(([id, nome]) => {
        const q = new URLSearchParams({ ...params, aba: id });
        return (
          <Link
            key={id}
            href={`${base}?${q}`}
            aria-current={id === ativa ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${id === ativa ? 'border-sky-500 font-medium text-sky-700 dark:text-sky-300' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
          >
            {nome}
          </Link>
        );
      })}
    </nav>
  );
}
