import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ContextoSessao } from '@/lib/contas/sessao';

const ABAS: [string, string, string][] = [
  ['/gestao/caixas', 'Caixas e cofre', 'gestao-caixa'],
  ['/gestao/fiados', 'Fiados', 'gestao-fiados'],
  ['/gestao', 'Fluxo e despesas', 'gestao-financeiro'],
  ['/gestao/dre', 'DRE', 'gestao-financeiro'],
];

/** Cabeçalho comum da Gestão da loja: abas liberadas e o seletor de loja (com "todas" quando consolida). */
export function GestaoTopo({ ctx, atual, titulo, subtitulo, loja, todas = false, seletor = true, extra }: { ctx: ContextoSessao; atual: string; titulo: string; subtitulo?: string; loja?: string | null; todas?: boolean; seletor?: boolean; extra?: ReactNode }) {
  return (
    <div className="space-y-3">
      <nav className="flex flex-wrap gap-2 text-sm">
        {ABAS.filter(([, , tela]) => ctx.telas.includes(tela)).map(([href, nome]) => (
          <Link key={href} href={href} className={`rounded-md px-3 py-1.5 ${href === atual ? 'bg-sky-600 text-white' : 'border border-zinc-300 dark:border-zinc-700'}`}>
            {nome}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{titulo}</h1>
          {subtitulo ? <p className="text-sm text-zinc-500">{subtitulo}</p> : null}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {seletor && (ctx.lojas.length > 1 || todas) ? (
            <form method="get" className="flex items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="rotulo">Lotérica</span>
                <select name="loja" defaultValue={loja ?? ''} className="campo">
                  {todas ? <option value="">Todas (consolidado)</option> : null}
                  {ctx.lojas.map((l) => (
                    <option key={l.codigo} value={l.codigo}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="botao">
                Ver
              </button>
            </form>
          ) : null}
          {extra}
        </div>
      </div>
    </div>
  );
}

export function SemGestao() {
  return (
    <div className="cartao space-y-2 text-sm">
      <h1 className="text-lg font-semibold">Gestão da loja</h1>
      <p>A gestão da loja física (caixas, fiados, fluxo de caixa e DRE) precisa das contas ligadas (DATABASE_URL, ou RADAR_AUTH=memoria para testar).</p>
    </div>
  );
}
