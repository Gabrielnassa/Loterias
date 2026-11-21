import Link from 'next/link';
import { EstornoBotao } from '@/components/EstornoBotao';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { Indisponivel } from '@/components/Indisponivel';
import { Kpi } from '@/components/Kpi';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtDataCurta, fmtHora, fmtMoeda, fmtPct, NOME_MODALIDADE } from '@/lib/formato';
import { boloesMkp, MinhaIndisponivel } from '@/lib/minha';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bolões MKP' };

export default async function BoloesMkp({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const dias = Number(sp.dias) || 7;
  let d;
  try {
    d = await boloesMkp(fonteDeDados(), { dias });
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return <Indisponivel mensagem={e.message} />;
    throw e;
  }
  const ativos = d.linhas.filter((l) => l.status === 'a_venda' && !l.estornado);
  const total = d.linhas.filter((l) => !l.estornado);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Franquia de hoje" valor={fmtMoeda(d.franquia.usado)} detalhe={`de ${fmtMoeda(d.franquia.limite)} · disponível ${fmtMoeda(d.franquia.disponivel)}`} />
        <Kpi rotulo="Bolões à venda" valor={ativos.length} detalhe={`${ativos.reduce((s, l) => s + l.disponiveis, 0)} cotas disponíveis`} />
        <Kpi rotulo={`Recebido (${dias} dias)`} valor={fmtMoeda(total.reduce((s, l) => s + l.recebido, 0))} detalhe={`internet ${total.reduce((s, l) => s + l.vendidasInternet, 0)} · balcão ${total.reduce((s, l) => s + l.vendidasBalcao, 0)} cotas`} />
        <Kpi rotulo={`Lucro (${dias} dias)`} valor={fmtMoeda(total.reduce((s, l) => s + l.lucro, 0))} detalhe="tarifa − sobra + comissão" />
      </div>

      {d.breakEven.length ? (
        <section className="cartao">
          <h2 className="mb-2 font-semibold">Break-even dos bolões à venda</h2>
          <ul className="flex flex-wrap gap-3 text-sm">
            {d.breakEven.map((b) => (
              <li key={`${b.modalidade}${b.concurso}`} className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                {NOME_MODALIDADE[b.modalidade]} {b.concurso}:{' '}
                <strong>
                  {b.breakEven.cotasFaltando === null ? 'não empata nem vendendo tudo' : b.breakEven.cotasFaltando === 0 ? 'já empatou' : `${b.breakEven.cotasFaltando} cotas pro break-even`}
                </strong>
                {b.breakEven.pctNecessario !== null ? <span className="text-zinc-500"> ({fmtPct(b.breakEven.pctNecessario)} do total vendido)</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="cartao space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FormFiltros>
            <Seletor nome="dias" rotulo="Período" valor={String(dias)} opcoes={[['1', 'Hoje'], ['7', '7 dias'], ['30', '30 dias']]} />
          </FormFiltros>
          <div className="flex gap-2">
            <a className="botao" href={`/api/minha/boloes?dias=${dias}&formato=csv`}>CSV</a>
            <a className="botao" href={`/api/minha/boloes?dias=${dias}&formato=xlsx`}>Excel</a>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tabela min-w-[1100px]">
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Concurso</th>
                <th>Formato</th>
                <th className="text-right" title="internet + balcão / total">Vendidas</th>
                <th className="text-right">Cota</th>
                <th className="text-right">Recebido</th>
                <th className="text-right">Custo</th>
                <th className="text-right">Lucro</th>
                <th className="text-right">Fila</th>
                <th className="text-right" title="colocação atual (entrada)">UF</th>
                <th className="text-right">Cidade</th>
                <th className="text-right">Brasil</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {d.linhas.map((l) => {
                const c = l.colocacaoAtual ?? l.colocacaoEntrada;
                return (
                  <tr key={l.id} className={l.estornado ? 'opacity-50' : ''}>
                    <td className="whitespace-nowrap">
                      {fmtDataCurta(l.entradaEm)} {fmtHora(l.entradaEm)}
                    </td>
                    <td className="whitespace-nowrap">
                      {NOME_MODALIDADE[l.modalidade]} {l.concurso}
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs">{l.formato}</td>
                    <td className="text-right">
                      {l.vendidasInternet + l.vendidasBalcao}/{l.cotasTotal}
                      {l.vendidasBalcao ? <span className="ml-1 text-xs text-zinc-500">({l.vendidasBalcao} balcão)</span> : null}
                    </td>
                    <td className="whitespace-nowrap text-right">{fmtMoeda(l.valorCota)}</td>
                    <td className="whitespace-nowrap text-right">{fmtMoeda(l.recebido)}</td>
                    <td className="whitespace-nowrap text-right">{fmtMoeda(l.custo)}</td>
                    <td className={`whitespace-nowrap text-right ${l.lucro < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{fmtMoeda(l.lucro)}</td>
                    <td className="text-right">{l.fila}ª</td>
                    <td className="text-right">
                      {c.uf.posicao}º <span className="text-xs text-zinc-500">p{c.uf.pagina}</span>
                    </td>
                    <td className="text-right">{c.cidade.posicao}º</td>
                    <td className="text-right">{c.brasil.posicao}º</td>
                    <td className="whitespace-nowrap">
                      {l.estornado ? 'estornado' : l.status === 'a_venda' ? 'à venda' : l.status === 'esgotado' ? 'esgotou' : `encerrado${l.disponiveis ? `, sobrou ${l.disponiveis}` : ''}`}{' '}
                      <EstornoBotao id={l.id} estornado={l.estornado} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {d.linhas.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Nenhum bolão no período.</p> : null}
        </div>
        <p className="text-xs text-zinc-500">
          Colocação: atual para bolões à venda (regra fila + chegada sobre a vitrine), na entrada para os demais. Balcão = cotas impressas no TFL (contam como vendidas e geram tarifa).{' '}
          <Link className="link" href="/minha/financeiro">Ver financeiro</Link>
        </p>
      </section>
    </div>
  );
}
