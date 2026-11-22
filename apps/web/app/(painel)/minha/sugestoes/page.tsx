import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { Indisponivel } from '@/components/Indisponivel';
import { Kpi } from '@/components/Kpi';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtDataLonga, fmtMoeda, fmtPct, NOME_MODALIDADE } from '@/lib/formato';
import { MinhaIndisponivel } from '@/lib/minha';
import { sugestoesParaLoja } from '@/lib/sugestoes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sugestões' };

const COR_RISCO = { baixo: 'text-emerald-700 dark:text-emerald-400', medio: 'text-amber-700 dark:text-amber-400', alto: 'text-rose-700 dark:text-rose-400' } as const;

export default async function Sugestoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  let d;
  try {
    d = await sugestoesParaLoja(fonteDeDados(), { loja: sp.loja ?? null, dia: sp.dia ?? null, limite: sp.limite ? Number(sp.limite) : null, valorMaximo: sp.max ? Number(sp.max) : null });
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return <Indisponivel mensagem={e.message} />;
    throw e;
  }
  const f = d.franquia;
  const q = new URLSearchParams({ loja: d.loterica.codigoCaixa, dia: d.dia, limite: String(f.limite) });
  return (
    <div className="space-y-6">
      <section className="cartao space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Franquia de {fmtDataLonga(`${d.dia}T15:00:00Z`)}</h2>
            <p className="text-sm text-zinc-500">{d.loterica.nome} · base: o que vendeu em {d.uf} nas últimas {Math.round(d.dias / 7)} semanas, no mesmo dia da semana</p>
          </div>
          <div className="flex gap-2">
            <a className="botao" href={`/api/minha/sugestoes?${q}&formato=csv`}>CSV</a>
            <a className="botao" href={`/api/minha/sugestoes?${q}&formato=xlsx`}>Excel</a>
          </div>
        </div>
        <FormFiltros>
          <input type="hidden" name="loja" value={d.loterica.codigoCaixa} />
          <label className="flex flex-col gap-1"><span className="rotulo">Dia</span><input type="date" name="dia" defaultValue={d.dia} className="campo" /></label>
          <label className="flex flex-col gap-1"><span className="rotulo">Franquia (R$)</span><input type="number" name="limite" min={0} step={100} defaultValue={f.limite} className="campo w-32" /></label>
          <Seletor nome="max" rotulo="Bolão até" valor={sp.max ?? ''} opcoes={[['', 'qualquer valor'], ['200', 'R$ 200'], ['500', 'R$ 500'], ['1000', 'R$ 1.000'], ['2000', 'R$ 2.000']]} />
        </FormFiltros>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi rotulo="Franquia" valor={fmtMoeda(f.limite)} />
          <Kpi rotulo="Sugerido" valor={fmtMoeda(f.usado)} detalhe={fmtPct(f.limite ? f.usado / f.limite : 0)} />
          <Kpi rotulo="Fica livre" valor={fmtMoeda(f.sobraDaFranquia)} detalhe="o mercado não absorve mais com lucro" />
          <Kpi rotulo="Lucro esperado" valor={fmtMoeda(f.lucroEsperado)} detalhe="tarifa + comissão − sobra" />
        </div>
        <div className="overflow-x-auto">
          <table className="tabela tabular min-w-[900px]">
            <thead><tr><th>Loteria</th><th className="text-right">Sugerido</th><th>Formato</th><th className="text-right">Bolões</th><th className="text-right">Cota</th><th className="text-right">Lucro esp.</th><th>Risco</th><th>Por quê</th></tr></thead>
            <tbody>
              {f.linhas.map((l) => (
                <tr key={l.modalidade}>
                  <td className="whitespace-nowrap">{NOME_MODALIDADE[l.modalidade]}</td>
                  <td className="text-right">{fmtMoeda(l.valorSugerido)}</td>
                  <td className="font-mono text-xs">{l.recomendacao?.formato ?? '—'}</td>
                  <td className="text-right">{l.boloes}</td>
                  <td className="text-right">{l.recomendacao ? fmtMoeda(l.recomendacao.valorCota) : '—'}</td>
                  <td className="text-right">{fmtMoeda(l.lucroEsperado)}</td>
                  <td className={l.recomendacao ? COR_RISCO[l.recomendacao.risco] : ''}>{l.recomendacao ? `${l.recomendacao.risco} (${fmtPct(l.recomendacao.chanceDePrejuizo)} de prejuízo)` : '—'}</td>
                  <td className="text-xs text-zinc-600 dark:text-zinc-400">{l.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {d.otimizador.map((o) => (
        <section key={o.modalidade} className="cartao space-y-3">
          <h2 className="font-semibold">Otimizador · {NOME_MODALIDADE[o.modalidade]}</h2>
          <p className="text-sm text-zinc-500">Lucro esperado = tarifa x cotas que devem vender + comissão − sobra esperada, sobre bolões parecidos já encerrados. Ordem: lucro por R$ de franquia.</p>
          <div className="overflow-x-auto">
            <table className="tabela tabular min-w-[980px]">
              <thead><tr><th>Formato</th><th className="text-right">Bolão</th><th className="text-right">Cota</th><th className="text-right">Vende</th><th className="text-right">Esgota</th><th className="text-right">Tarifa</th><th className="text-right">Sobra</th><th className="text-right">Lucro esp.</th><th className="text-right">Por R$</th><th className="text-right">Pior 10%</th><th>Risco</th><th className="text-right">Base</th><th className="text-right" title="% vendido na mesma faixa de preço na foto real da vitrine de São Paulo (21/11/2026 16:44, parcial)">Real SP*</th></tr></thead>
              <tbody>
                {o.opcoes.map((a) => (
                  <tr key={a.formato}>
                    <td className="font-mono text-xs">{a.formato}</td><td className="text-right">{fmtMoeda(a.valorBolao)}</td><td className="text-right">{fmtMoeda(a.valorCota)}</td>
                    <td className="text-right">{fmtPct(a.chanceDeVenda)}</td><td className="text-right">{fmtPct(a.chanceDeEsgotar)}</td><td className="text-right">{fmtMoeda(a.tarifaEsperada)}</td>
                    <td className="text-right">{fmtMoeda(a.sobraEsperada)}</td><td className="text-right font-semibold">{fmtMoeda(a.lucroEsperado)}</td><td className="text-right">{fmtPct(a.lucroPorReal, 1)}</td>
                    <td className="text-right">{fmtMoeda(a.lucroP10)}</td><td className={COR_RISCO[a.risco]}>{a.risco}</td>
                    <td className="text-right text-xs text-zinc-500">{a.amostras} {a.base === 'formato' ? 'iguais' : a.base === 'parecidos' ? 'parecidos' : 'Brasil'}</td>
                    <td className="text-right text-xs">{a.referenciaReal ? fmtPct(a.referenciaReal.pctVendido) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p className="text-xs text-zinc-500">Estimativas a partir da vitrine pública; vendas de terceiros contam como internet. Valores sem tarifa. Não é garantia de venda. * Real SP: % vendido na mesma faixa de preço (com tarifa) na foto da vitrine de São Paulo de 21/11/2026 às 16:44, horas antes do fechamento (parcial).</p>
    </div>
  );
}
