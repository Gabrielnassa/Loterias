import { fmtInt, fmtMoeda, fmtPct } from '@/lib/formato';
import { analisarLoteca, GRADE_EXEMPLO } from '@/lib/loteca';
import { COMBINACOES_LOTECA } from '@radar/core';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Loteca' };

const umEm = (p: number) => (p > 0 ? `1 em ${fmtInt(Math.round(1 / p))}` : '—');

export default async function Loteca({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const texto = sp.grade ?? GRADE_EXEMPLO;
  const d = sp.d !== undefined ? Number(sp.d) : undefined;
  const t = sp.t !== undefined ? Number(sp.t) : undefined;
  const valida = d !== undefined && t !== undefined && COMBINACOES_LOTECA.some(([x, y]) => x === d && y === t);
  const a = analisarLoteca(texto, valida ? d : undefined, valida ? t : undefined);
  const q = (dd: number, tt: number) => `/loteca?${new URLSearchParams({ grade: texto, d: String(dd), t: String(tt) })}`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Loteca</h1>
        <p className="text-sm text-zinc-500">Chance de cada jogo e a melhor marcação para cada quantidade de duplos e triplos. Com odds, tiramos a margem da casa; sem odds, um modelo de força (Elo + mando + forma).</p>
      </div>
      <form method="get" className="cartao space-y-2">
        <label className="flex flex-col gap-1">
          <span className="rotulo">Grade (uma linha por jogo: Time A x Time B; odd 1; odd X; odd 2)</span>
          <textarea name="grade" rows={8} defaultValue={texto} className="campo font-mono text-xs" />
        </label>
        <button className="botao" type="submit">Calcular</button>
        {a.jogos.length !== 14 ? <p className="text-sm text-amber-700">A grade precisa de 14 jogos ({a.jogos.length} lidos).</p> : null}
      </form>
      {a.escolhida ? (
        <section className="cartao space-y-3">
          <h2 className="font-semibold">
            Melhor marcação com {a.escolhida.duplos} duplos e {a.escolhida.triplos} triplos · {fmtInt(a.escolhida.apostas)} apostas · {fmtMoeda(a.escolhida.valor)}
          </h2>
          <p className="text-sm">14 acertos: <strong>{umEm(a.escolhida.chance14)}</strong> · 13 acertos: {umEm(a.escolhida.chance13)}</p>
          <table className="tabela tabular">
            <thead><tr><th>#</th><th>Jogo</th><th className="text-right">1</th><th className="text-right">X</th><th className="text-right">2</th><th>Marcar</th><th className="text-right">Acerta</th></tr></thead>
            <tbody>
              {a.jogos.map((j, i) => {
                const p = a.probs[i]!;
                const m = a.escolhida!.jogos[i]!;
                return (
                  <tr key={i}>
                    <td>{i + 1}</td><td>{j.time1} x {j.time2}{p.fonte === 'odds' ? <span className="ml-1 text-xs text-zinc-500">(odds, margem {fmtPct(p.margem ?? 0, 1)})</span> : null}</td>
                    <td className="text-right">{fmtPct(p['1'])}</td><td className="text-right">{fmtPct(p.X)}</td><td className="text-right">{fmtPct(p['2'])}</td>
                    <td className="font-mono">{m.colunas.join(' ')}{m.tipo !== 'seco' ? <span className="ml-1 text-xs text-sky-700 dark:text-sky-400">{m.tipo}</span> : null}</td>
                    <td className="text-right">{fmtPct(m.chance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
      {a.tabela.length ? (
        <section className="cartao space-y-2">
          <h2 className="font-semibold">Todas as combinações do volante</h2>
          <table className="tabela tabular">
            <thead><tr><th>Duplos</th><th>Triplos</th><th className="text-right">Apostas</th><th className="text-right">Valor</th><th className="text-right">14 acertos</th><th className="text-right">13 acertos</th><th /></tr></thead>
            <tbody>
              {a.tabela.map((m) => (
                <tr key={`${m.duplos}-${m.triplos}`} className={a.escolhida && m.duplos === a.escolhida.duplos && m.triplos === a.escolhida.triplos ? 'bg-sky-50 dark:bg-sky-500/10' : ''}>
                  <td>{m.duplos}</td><td>{m.triplos}</td><td className="text-right">{fmtInt(m.apostas)}</td><td className="text-right">{fmtMoeda(m.valor)}</td>
                  <td className="text-right">{umEm(m.chance14)}</td><td className="text-right">{umEm(m.chance13)}</td>
                  <td><a className="link" href={q(m.duplos, m.triplos)}>ver</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-zinc-500">Aposta simples R$ 2,00; o volante exige ao menos 1 duplo ou 1 triplo. Chances são estimativas a partir das odds ou do modelo, não garantia.</p>
        </section>
      ) : null}
    </div>
  );
}
