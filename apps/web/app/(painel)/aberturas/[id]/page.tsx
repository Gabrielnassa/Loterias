import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { Kpi } from '@/components/Kpi';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtAtraso, fmtDataLonga, fmtHora, fmtMoeda, NOME_MODALIDADE } from '@/lib/formato';
import { detalheAbertura, locais } from '@/lib/servico';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function DetalheAbertura({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const fonte = fonteDeDados();
  const uf = sp.uf || undefined;
  const d = await detalheAbertura(fonte, id, uf ? { uf } : {});
  if (!d) notFound();
  const { ufs } = await locais(fonte);
  const q = new URLSearchParams(uf ? { uf } : {}).toString();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rotulo">Detalhe da abertura</div>
          <h1 className="text-2xl font-semibold">
            {NOME_MODALIDADE[d.abertura.modalidade]} {d.abertura.concurso}
          </h1>
          <p className="text-sm text-zinc-500">
            {fmtDataLonga(d.abertura.t0)} · T0 {fmtHora(d.abertura.t0)} · janela de 60 min
          </p>
        </div>
        <div className="flex gap-2">
          <a className="botao" href={`/api/aberturas/${id}?formato=csv${q ? `&${q}` : ''}`}>
            CSV
          </a>
          <a className="botao" href={`/api/aberturas/${id}?formato=xlsx${q ? `&${q}` : ''}`}>
            Excel
          </a>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Bolões na janela" valor={d.resumo.boloes} />
        <Kpi rotulo="Lotéricas" valor={d.resumo.lotericas} />
        <Kpi rotulo="Esgotaram" valor={d.resumo.esgotados} />
        <Kpi rotulo="Valor (sem tarifa)" valor={fmtMoeda(d.resumo.valorTotal)} />
      </div>
      <section className="cartao space-y-4">
        <FormFiltros>
          <Seletor nome="uf" rotulo="UF" valor={uf ?? ''} opcoes={[['', 'Todas'], ...ufs.map((u) => [u, u] as [string, string])]} />
        </FormFiltros>
        <div className="overflow-x-auto">
          <table className="tabela min-w-[980px]">
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Atraso</th>
                <th>Lotérica</th>
                <th>Formato</th>
                <th className="text-right">Fila</th>
                <th className="text-right" title="Cotas vendidas / total">Vendidas</th>
                <th className="text-right">Cota</th>
                <th className="text-right">Valor</th>
                <th className="text-right">Cidade</th>
                <th className="text-right">UF</th>
                <th className="text-right">Brasil</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {d.linhas.map((l) => (
                <tr key={l.id}>
                  <td title={l.empate ? 'Entrou na mesma leitura que outros bolões: ordem pela fonte' : undefined}>
                    {fmtHora(l.entradaEm)}
                    {l.empate ? <span className="ml-1 text-xs text-zinc-400">=</span> : null}
                  </td>
                  <td className="text-zinc-500">{fmtAtraso(l.atrasoS)}</td>
                  <td>
                    <Link className="link" href={`/lotericas/${l.loterica.codigoCaixa}`}>
                      {l.loterica.nome}
                    </Link>
                    <span className="ml-1 whitespace-nowrap text-xs text-zinc-500">
                      {l.loterica.cidade}/{l.loterica.uf}
                    </span>
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs">{l.formato}</td>
                  <td className="text-right">{l.fila}ª</td>
                  <td className="text-right">
                    {l.cotasVendidas}/{l.cotasTotal}
                  </td>
                  <td className="text-right">{fmtMoeda(l.valorCota)}</td>
                  <td className="text-right">{fmtMoeda(l.valorTotal)}</td>
                  <td className="text-right">
                    {l.colocacao.cidade.posicao}º <span className="text-xs text-zinc-500">p{l.colocacao.cidade.pagina}</span>
                  </td>
                  <td className="text-right">
                    {l.colocacao.uf.posicao}º <span className="text-xs text-zinc-500">p{l.colocacao.uf.pagina}</span>
                  </td>
                  <td className="text-right">
                    {l.colocacao.brasil.posicao}º <span className="text-xs text-zinc-500">p{l.colocacao.brasil.pagina}</span>
                  </td>
                  <td>
                    {l.situacao === 'esgotou' ? (
                      <span className="text-emerald-700 dark:text-emerald-400">esgotou{l.esgotouEm ? ` ${fmtHora(l.esgotouEm)}` : ''}</span>
                    ) : l.situacao === 'sobrou' ? (
                      <span className="text-rose-700 dark:text-rose-400">sobrou {l.sobra}</span>
                    ) : (
                      <span className="text-zinc-500">à venda</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!d.colocacaoDisponivel ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Coleta pelos links públicos das lotéricas monitoradas: a colocação na vitrine não está disponível nesta abertura (as posições mostradas são só entre as monitoradas).
          </p>
        ) : null}
        <p className="text-xs text-zinc-500">
          Colocação no momento em que o bolão entrou (não a atual). Hora ao segundo = leitura em que o bolão apareceu pela 1ª vez.
        </p>
      </section>
    </div>
  );
}
