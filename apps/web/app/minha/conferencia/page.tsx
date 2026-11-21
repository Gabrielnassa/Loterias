import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { Indisponivel } from '@/components/Indisponivel';
import { Kpi } from '@/components/Kpi';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtDataCurta, fmtMoeda, NOME_MODALIDADE } from '@/lib/formato';
import { conferenciaMkp, MinhaIndisponivel } from '@/lib/minha';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conferência MKP' };

export default async function ConferenciaMkp({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const dias = Number(sp.dias) || 30;
  let d;
  try {
    d = await conferenciaMkp(fonteDeDados(), { dias, loja: sp.loja ?? null });
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return <Indisponivel mensagem={e.message} />;
    throw e;
  }
  const premiados = d.linhas.filter((l) => l.premioTotal > 0);
  const simulado = d.linhas.some((l) => l.origemResultado === 'seed');
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Bolões conferidos" valor={d.linhas.length} detalhe={`${d.resultados} resultados`} />
        <Kpi rotulo="Bolões premiados" valor={premiados.length} />
        <Kpi rotulo="Prêmios dos bolões" valor={fmtMoeda(d.totalPremios)} detalhe="clientes + lotérica" />
        <Kpi rotulo="Seu prêmio (sobras)" valor={fmtMoeda(d.totalLoterica)} detalhe="prêmio / cotas x cotas que sobraram" />
      </div>
      <section className="cartao space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FormFiltros>
            <input type="hidden" name="loja" value={d.loterica.codigoCaixa} />
            <Seletor nome="dias" rotulo="Período" valor={String(dias)} opcoes={[['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias']]} />
          </FormFiltros>
          <div className="flex gap-2">
            <a className="botao" href={`/api/minha/conferencia?dias=${dias}&loja=${d.loterica.codigoCaixa}&formato=csv`}>CSV</a>
            <a className="botao" href={`/api/minha/conferencia?dias=${dias}&loja=${d.loterica.codigoCaixa}&formato=xlsx`}>Baixar planilha</a>
          </div>
        </div>
        {simulado ? <p className="text-xs text-amber-700 dark:text-amber-400">Resultados e rateios do seed são SIMULADOS. Com o coletor real, vêm da API oficial da CAIXA.</p> : null}
        <div className="overflow-x-auto">
          <table className="tabela min-w-[900px]">
            <thead>
              <tr>
                <th>Concurso</th><th>Apuração</th><th>Sorteadas</th><th>Formato</th><th className="text-right">Acertos</th><th>Faixas</th>
                <th className="text-right">Prêmio do bolão</th><th className="text-right">Por cota</th><th className="text-right">Sobraram</th><th className="text-right">Seu prêmio</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {d.linhas.map((l) => (
                <tr key={l.id} className={l.premioTotal > 0 ? 'bg-emerald-50/60 dark:bg-emerald-500/5' : ''}>
                  <td className="whitespace-nowrap">{NOME_MODALIDADE[l.modalidade]} {l.concurso}</td>
                  <td>{fmtDataCurta(l.dataApuracao)}</td>
                  <td className="font-mono text-xs">{l.dezenas.map((x) => String(x).padStart(2, '0')).join(' ')}</td>
                  <td className="whitespace-nowrap font-mono text-xs">{l.formato}</td>
                  <td className="text-right">{l.melhorAcerto}</td>
                  <td className="text-xs">{l.faixas.length ? l.faixas.map((f) => `${f.quantidade}× ${f.acertos} acertos`).join(', ') : '—'}</td>
                  <td className="text-right">{fmtMoeda(l.premioTotal)}</td>
                  <td className="text-right">{fmtMoeda(l.premioPorCota)}</td>
                  <td className="text-right">{l.cotasSobradas}/{l.cotasTotal}</td>
                  <td className="text-right font-semibold">{fmtMoeda(l.premioLoterica)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.linhas.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Nenhum bolão com resultado e jogos no período.</p> : null}
        </div>
      </section>
    </div>
  );
}
