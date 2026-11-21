import { FormFiltros } from '@/components/FormFiltros';
import { Indisponivel } from '@/components/Indisponivel';
import { Kpi } from '@/components/Kpi';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtDataCurta, fmtMoeda, fmtInt, NOME_MODALIDADE } from '@/lib/formato';
import { financeiroMkp, MinhaIndisponivel } from '@/lib/minha';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Financeiro MKP' };

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export default async function FinanceiroMkp({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  let d;
  try {
    d = await financeiroMkp(fonteDeDados(), { ...(sp.de && DIA.test(sp.de) ? { de: sp.de } : {}), ...(sp.ate && DIA.test(sp.ate) ? { ate: sp.ate } : {}), loja: sp.loja ?? null });
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return <Indisponivel mensagem={e.message} />;
    throw e;
  }
  const q = `de=${d.de}&ate=${d.ate}&loja=${d.loterica.codigoCaixa}`;
  const t = d.total;
  return (
    <div className="space-y-6">
      <section className="cartao flex flex-wrap items-end justify-between gap-3 print:hidden">
        <FormFiltros>
          <input type="hidden" name="loja" value={d.loterica.codigoCaixa} />
          <label className="flex flex-col gap-1">
            <span className="rotulo">De</span>
            <input type="date" name="de" defaultValue={d.de} className="campo" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Até</span>
            <input type="date" name="ate" defaultValue={d.ate} className="campo" />
          </label>
        </FormFiltros>
        <div className="flex gap-2">
          <a className="botao" href={`/api/minha/financeiro?${q}&formato=csv`}>CSV</a>
          <a className="botao" href={`/api/minha/financeiro?${q}&formato=xlsx`}>Excel</a>
        </div>
      </section>
      <p className="text-sm text-zinc-500">
        {fmtDataCurta(d.de)} a {fmtDataCurta(d.ate)} · prêmios não entram no resultado · use Imprimir do navegador para o resumo em papel
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi rotulo="Resultado" valor={fmtMoeda(t.lucro)} detalhe="tarifa − sobra + comissão" />
        <Kpi rotulo="Recebido" valor={fmtMoeda(t.recebidoInternet + t.recebidoBalcao)} detalhe={`internet ${fmtMoeda(t.recebidoInternet)} · balcão ${fmtMoeda(t.recebidoBalcao)}`} />
        <Kpi rotulo="Tarifa + comissão" valor={fmtMoeda(t.tarifa + t.comissao)} detalhe={`comissão ${fmtMoeda(t.comissao)}`} />
        <Kpi rotulo="Custo (sobras)" valor={fmtMoeda(t.sobra)} detalhe={`${fmtInt(t.cotasSobradas)} cotas`} />
        <Kpi rotulo="Cotas vendidas" valor={fmtInt(t.cotasVendidas)} detalhe={`${d.boloes.length} bolões`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="cartao overflow-x-auto">
          <h2 className="mb-2 font-semibold">Dia a dia</h2>
          <table className="tabela">
            <thead>
              <tr><th>Dia</th><th className="text-right">Vendidas</th><th className="text-right">Tarifa</th><th className="text-right">Comissão</th><th className="text-right">Sobra</th><th className="text-right">Resultado</th></tr>
            </thead>
            <tbody className="tabular">
              {d.porDia.map((x) => (
                <tr key={x.dia}>
                  <td>{fmtDataCurta(x.dia)}</td>
                  <td className="text-right">{x.cotasVendidas}</td>
                  <td className="text-right">{fmtMoeda(x.tarifa)}</td>
                  <td className="text-right">{fmtMoeda(x.comissao)}</td>
                  <td className="text-right">{fmtMoeda(x.sobra)}</td>
                  <td className={`text-right ${x.lucro < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>{fmtMoeda(x.lucro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="cartao space-y-4">
          <div>
            <h2 className="mb-2 font-semibold">Por loteria</h2>
            <table className="tabela">
              <tbody className="tabular">
                {d.porModalidade.map((x) => (
                  <tr key={x.modalidade}>
                    <td>{NOME_MODALIDADE[x.modalidade]}</td>
                    <td className="text-right">{x.cotasVendidas} cotas</td>
                    <td className={`text-right ${x.lucro < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>{fmtMoeda(x.lucro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(['maioresLucros', 'maioresPrejuizos'] as const).map((k) => (
            <div key={k}>
              <h2 className="mb-2 font-semibold">{k === 'maioresLucros' ? 'Maiores lucros' : 'Maiores prejuízos'}</h2>
              <table className="tabela">
                <tbody className="tabular">
                  {d[k].map((b) => (
                    <tr key={b.id}>
                      <td>{fmtDataCurta(b.dia)}</td>
                      <td>{NOME_MODALIDADE[b.modalidade]} {b.concurso}</td>
                      <td className="text-right">{b.cotasVendidas} vendidas · {b.cotasSobradas} sobraram</td>
                      <td className={`text-right ${b.lucro < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{fmtMoeda(b.lucro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d[k].length === 0 ? <p className="text-sm text-zinc-500">Nenhum.</p> : null}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
