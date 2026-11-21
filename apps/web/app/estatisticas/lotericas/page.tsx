import Link from 'next/link';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtDataCurta, fmtInt, fmtMoeda } from '@/lib/formato';
import { lerFiltro, topDoPeriodo } from '@/lib/mercado';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Estatísticas: Lotéricas' };

const CRITERIOS: [string, string][] = [
  ['valor', 'Mais R$ inserido'],
  ['vendido', 'Mais R$ vendido'],
  ['boloes', 'Mais bolões'],
];

export default async function EstatisticasLotericas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const fonte = fonteDeDados();
  const criterio = sp.criterio === 'vendido' || sp.criterio === 'boloes' ? sp.criterio : 'valor';
  const dias = Number(sp.dias) === 7 || Number(sp.dias) === 90 ? Number(sp.dias) : 30;
  const [busca, top] = await Promise.all([sp.q ? fonte.buscar(sp.q, 30) : Promise.resolve([]), topDoPeriodo(fonte, { dias, criterio, filtro: lerFiltro({ uf: sp.uf ?? null }) })]);
  const q = new URLSearchParams({ criterio, dias: String(dias), ...(sp.uf ? { uf: sp.uf } : {}) });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Estatísticas › Lotéricas</h1>
        <p className="text-sm text-zinc-500">Busque qualquer lotérica pelo nome, cidade ou código · <Link className="link" href="/estatisticas">Loterias</Link></p>
      </div>
      <section className="cartao space-y-3">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1">
            <span className="rotulo">Lotérica</span>
            <input name="q" defaultValue={sp.q ?? ''} placeholder="Nome, cidade ou código (ex.: 2894 ou 21.002894-7)" className="campo" />
          </label>
          <button className="botao" type="submit">Buscar</button>
        </form>
        {sp.q ? (
          busca.length ? (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {busca.map((l) => (
                <li key={l.codigoCaixa} className="flex justify-between py-1.5">
                  <Link className="link" href={`/estatisticas/lotericas/${l.codigoCaixa}`}>{l.nome}</Link>
                  <span className="text-zinc-500">{l.cidade}/{l.uf} · {l.codigoCaixa}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">Nada encontrado para “{sp.q}”.</p>
          )
        ) : null}
      </section>
      <section className="cartao space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-semibold">Top 10 · {fmtDataCurta(top.de)} a {fmtDataCurta(top.ate)}</h2>
          <div className="flex gap-2">
            <a className="botao" href={`/api/estatisticas/lotericas?${q}&formato=csv`}>CSV</a>
            <a className="botao" href={`/api/estatisticas/lotericas?${q}&formato=xlsx`}>Excel</a>
          </div>
        </div>
        <FormFiltros>
          <Seletor nome="criterio" rotulo="Critério" valor={criterio} opcoes={CRITERIOS} />
          <Seletor nome="dias" rotulo="Período" valor={String(dias)} opcoes={[['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias']]} />
          <Seletor nome="uf" rotulo="UF" valor={sp.uf ?? ''} opcoes={[['', 'Brasil'], ...['BA', 'MG', 'PE', 'PR', 'RJ', 'RS', 'SP'].map((u) => [u, u] as [string, string])]} />
        </FormFiltros>
        <table className="tabela tabular">
          <thead><tr><th>#</th><th>Lotérica</th><th>Cidade</th><th className="text-right">Bolões</th><th className="text-right">R$ inserido</th><th className="text-right">R$ vendido</th></tr></thead>
          <tbody>
            {top.linhas.map((l, i) => (
              <tr key={l.loterica.codigoCaixa}>
                <td>{i + 1}</td><td><Link className="link" href={`/estatisticas/lotericas/${l.loterica.codigoCaixa}`}>{l.loterica.nome}</Link></td><td>{l.loterica.cidade}/{l.loterica.uf}</td>
                <td className="text-right">{fmtInt(l.boloes)}</td><td className="text-right">{fmtMoeda(l.valor)}</td><td className="text-right">{fmtMoeda(l.vendido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
