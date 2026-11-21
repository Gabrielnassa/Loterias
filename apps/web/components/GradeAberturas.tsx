import Link from 'next/link';
import type { LinhaGrade } from '@radar/core';
import { DIAS_SEMANA, fmtDataCurta, NOME_MODALIDADE } from '@/lib/formato';

const SIGLA: Record<string, string> = { 'mega-sena': 'MS', lotofacil: 'LF', quina: 'QN' };

/**
 * Tela 1: uma linha por semana, uma coluna por dia. Célula = hora do 1º bolão + colocação no
 * escopo + página, colorida por faixa (pág. 1, 2-3, 4+). Vazia = não abriu ("—" se houve abertura).
 */
export function GradeAberturas({ linhas, mostrarModalidade = false }: { linhas: LinhaGrade[]; mostrarModalidade?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabela min-w-[760px]">
        <thead>
          <tr>
            <th className="w-20">Semana</th>
            {DIAS_SEMANA.map((d) => (
              <th key={d} className="text-center">
                {d}
              </th>
            ))}
            <th className="text-right">Total</th>
            <th className="text-right">Melhor</th>
            <th className="text-right">Mediana</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.semana}>
              <td className="tabular text-xs text-zinc-500">{fmtDataCurta(l.semana)}</td>
              {l.celulas.map((c) => (
                <td key={c.dia} className="p-1">
                  {c.participou ? (
                    <Link
                      href={`/aberturas/${c.aberturaId}`}
                      title={`${fmtDataCurta(c.dia)} · ${NOME_MODALIDADE[c.modalidade ?? ''] ?? ''} · ${c.participacoesNoDia} de ${c.aberturasNoDia} aberturas${c.empate ? ' · empate na leitura' : ''}`}
                      className={`faixa-${c.faixa} tabular block rounded-md px-1.5 py-1 text-center leading-tight hover:ring-2 hover:ring-sky-500/50`}
                    >
                      <span className="block text-[13px] font-semibold">{c.hora}</span>
                      <span className="block text-[11px] opacity-80">
                        {c.posicao}º · p{c.pagina}
                        {mostrarModalidade && c.modalidade ? ` · ${SIGLA[c.modalidade] ?? ''}` : ''}
                      </span>
                    </Link>
                  ) : c.houveAbertura ? (
                    <span className="block rounded-md bg-zinc-100 py-2.5 text-center text-xs text-zinc-400 dark:bg-zinc-800/60 dark:text-zinc-500" title="Houve abertura e não abriu">
                      —
                    </span>
                  ) : (
                    <span className="block py-2.5 text-center text-xs text-zinc-300 dark:text-zinc-700" title="Sem abertura neste dia">
                      ·
                    </span>
                  )}
                </td>
              ))}
              <td className="tabular text-right text-xs">
                {l.total}/{l.aberturasOcorridas}
              </td>
              <td className="tabular text-right text-xs">{l.melhor ? `${l.melhor}º` : '—'}</td>
              <td className="tabular text-right text-xs">{l.mediana !== null ? `${Math.round(l.mediana)}º` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegendaFaixas() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="faixa-pag1 rounded px-2 py-0.5">pág. 1</span>
      <span className="faixa-pag2-3 rounded px-2 py-0.5">pág. 2-3</span>
      <span className="faixa-pag4+ rounded px-2 py-0.5">pág. 4+</span>
      <span>— houve abertura e não abriu · sem abertura</span>
    </div>
  );
}
