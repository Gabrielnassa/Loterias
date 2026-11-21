import type { ReactNode } from 'react';

export function Kpi({ rotulo, valor, detalhe }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="cartao min-w-0">
      <div className="rotulo">{rotulo}</div>
      <div className="tabular mt-1 text-2xl font-semibold">{valor}</div>
      {detalhe ? <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{detalhe}</div> : null}
    </div>
  );
}
