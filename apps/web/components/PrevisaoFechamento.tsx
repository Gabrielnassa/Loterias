import { fmtDataCurta, fmtHora, fmtInt, fmtMoeda, fmtPct } from '@/lib/formato';
import type { previsaoDoConcurso } from '@/lib/mercado';

type Dados = NonNullable<Awaited<ReturnType<typeof previsaoDoConcurso>>>;
const hm = (d: Date) => fmtHora(d).slice(0, 5);

/** Previsão de fechamento com faixa, mínimo para zerar, parecidos e o backtest ao lado. */
export function PrevisaoFechamento({ d, em }: { d: Dados; em: Date }) {
  const p = d.previsao;
  if (!p) return <p className="text-sm text-zinc-500">Previsão indisponível: {d.motivo}.</p>;
  const b = d.backtest!;
  const caras = p.sobraPorFaixa.filter((f) => f.relativa !== null && f.relativa > 1.2);
  const baratas = p.sobraPorFaixa.find((f) => f.relativa === 1);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <h3 className="font-semibold">Previsão de fechamento</h3>
        <p className="text-sm">
          Devem sobrar <strong>~{fmtInt(p.cotasSobra.previsto)} cotas</strong> (faixa de 80%: {fmtInt(p.cotasSobra.min)} a {fmtInt(p.cotasSobra.max)}) em{' '}
          <strong>~{fmtInt(p.boloesSobra.previsto)} bolões</strong>, cerca de {fmtMoeda(p.valorSobra.previsto)} sem vender.
          {p.picoEm ? ` Pico de bolões à venda previsto às ${hm(p.picoEm)}${p.picoEm.getTime() < em.getTime() ? ' (já passou)' : ''}.` : ''}
        </p>
        {p.minimoParaZerar ? (
          <p className="text-sm">
            Para zerar até o fechamento ({p.minimoParaZerar.horasAteFechar.toLocaleString('pt-BR')} h): <strong>{fmtInt(p.minimoParaZerar.cotasPorHora)} cotas/h</strong> (~{fmtInt(p.minimoParaZerar.boloesPorHora)} bolões/h). Ritmo dos últimos 15 min:{' '}
            {fmtInt(d.ritmoPorHora)} cotas/h.
          </p>
        ) : null}
        {caras.length && baratas ? (
          <p className="text-sm">
            Nos concursos parecidos, {caras.map((f) => `cota ${f.faixa} sobrou ${f.relativa!.toLocaleString('pt-BR')}x mais`).join('; ')} que {baratas.faixa}.
          </p>
        ) : null}
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">{p.parecidos.length} concursos parecidos (a {fmtPct(p.fracao)} da janela)</summary>
          <table className="tabela tabular mt-2">
            <thead><tr><th>Concurso</th><th>Abriu</th><th className="text-right">Distância</th><th className="text-right">Sobra / à venda</th><th className="text-right">Sobraram</th></tr></thead>
            <tbody>
              {p.parecidos.map((x) => (
                <tr key={x.chave}><td>{x.chave}</td><td>{fmtDataCurta(x.abreEm)}</td><td className="text-right">{x.distancia.toLocaleString('pt-BR')}</td><td className="text-right">{fmtPct(x.razaoCotas)}</td><td className="text-right">{fmtInt(x.cotasSobra)} cotas</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
      <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <h3 className="font-semibold">Backtest</h3>
        <p className="text-sm">
          Acertou a faixa em <strong>{b.acertos} de {b.n}</strong> concursos anteriores; erro mediano da previsão central {b.erroMedianoPct === null ? '—' : fmtPct(b.erroMedianoPct, 1)}.
        </p>
        <table className="tabela tabular text-xs">
          <thead><tr><th>Concurso</th><th className="text-right">Previsto</th><th className="text-right">Real</th><th /></tr></thead>
          <tbody>
            {[...b.itens].reverse().slice(0, 8).map((i) => (
              <tr key={i.chave}><td>{i.chave}</td><td className="text-right">{fmtInt(i.previsto)}</td><td className="text-right">{fmtInt(i.real)}</td><td>{i.acertou ? '✓' : '✗'}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-zinc-500">Cada previsão do backtest usou só os concursos fechados antes dele.</p>
      </div>
    </div>
  );
}
