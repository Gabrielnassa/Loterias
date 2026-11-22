import Link from 'next/link';
import { somarMes } from '@radar/core';
import { GestaoTopo, SemGestao } from '@/components/GestaoNav';
import { contexto } from '@/lib/contexto';
import { fmtMoeda, fmtPct } from '@/lib/formato';
import { repositorioGestao } from '@/lib/gestao/ativo';
import { ErroGestao, painelDre } from '@/lib/gestao/servico';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'DRE mensal' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

export default async function Dre({ searchParams }: Props) {
  const sp = await searchParams;
  const repo = repositorioGestao();
  const ctx = await contexto();
  if (!repo || !ctx) return <SemGestao />;
  let d;
  try {
    d = await painelDre(repo, ctx, { mes: sp.mes });
  } catch (e) {
    if (e instanceof ErroGestao) return <div className="cartao text-sm">{e.message}</div>;
    throw e;
  }
  const varias = d.lojas.length > 1;
  return (
    <div className="space-y-6">
      <GestaoTopo
        ctx={ctx}
        atual="/gestao/dre"
        seletor={false}
        titulo="DRE mensal"
        subtitulo={`${nomeMes(d.mes)} · ${varias ? `${d.lojas.length} lotéricas, consolidado` : d.lojas[0]?.nome}`}
        extra={
          <div className="flex items-center gap-2 text-sm">
            <Link className="botao" href={`/gestao/dre?mes=${somarMes(d.mes, -1)}`}>
              ‹ anterior
            </Link>
            <Link className="botao" href={`/gestao/dre?mes=${somarMes(d.mes, 1)}`}>
              seguinte ›
            </Link>
            <a className="botao" href={`/api/gestao/dre?mes=${d.mes}&formato=csv`}>
              CSV
            </a>
          </div>
        }
      />
      <section className="cartao overflow-x-auto">
        <table className="tabela min-w-[560px]">
          <thead>
            <tr>
              <th />
              {varias ? d.lojas.map((l) => <th key={l.codigo} className="text-right">{l.nome}</th>) : null}
              <th className="text-right">{varias ? 'Total' : 'Valor'}</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {d.linhas.map((l) => (
              <tr key={l.chave} className={l.nivel === 'item' ? '' : 'font-semibold'}>
                <td className={l.nivel === 'item' ? 'pl-6 text-zinc-600 dark:text-zinc-400' : ''}>{l.nome}</td>
                {varias ? d.lojas.map((j) => <td key={j.codigo} className={`text-right ${(l.porLoja[j.codigo] ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{fmtMoeda(l.porLoja[j.codigo] ?? 0)}</td>) : null}
                <td className={`text-right ${l.total < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{fmtMoeda(l.total)}</td>
              </tr>
            ))}
            <tr className="text-zinc-500">
              <td>Margem sobre a receita bruta</td>
              {varias ? d.lojas.map((j) => <td key={j.codigo} className="text-right">{fmtPct(d.margem[j.codigo], 1)}</td>) : null}
              <td className="text-right">{fmtPct(d.margem.total, 1)}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <p className="text-xs text-zinc-500">
        Regime de caixa: receitas e despesas pelo dia do lançamento. A arrecadação da CAIXA (o dinheiro dos jogos e pagamentos) não é receita da lotérica e não entra; as quebras de caixa (faltas e
        sobras dos fechamentos) entram porque a loja cobre as faltas.
      </p>
    </div>
  );
}
