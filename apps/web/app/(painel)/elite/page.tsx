import Link from 'next/link';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtDataCurta, fmtDataLonga, fmtHora, fmtInt, fmtMoeda, NOME_MODALIDADE } from '@/lib/formato';
import { lerFiltro, listasElite } from '@/lib/mercado';
import { locais } from '@/lib/servico';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Elite e Top da abertura' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function EliteTop({ searchParams }: Props) {
  const sp = await searchParams;
  const fonte = fonteDeDados();
  const minha = await fonte.minhaLoterica();
  const lista = sp.lista === 'top' ? 'top' : 'elite';
  const uf = sp.uf ?? minha?.uf ?? '';
  const cidade = sp.cidade ?? '';
  const [{ ufs, cidades }, r] = await Promise.all([locais(fonte), listasElite(fonte, { filtro: lerFiltro({ uf, cidade }) })]);
  const linhas = lista === 'top' ? r.top : r.elite;
  const params = new URLSearchParams({ lista, uf, cidade });
  const noites = [...r.noites].reverse();
  const minhaNaLista = minha ? linhas.find((l) => l.loterica.codigoCaixa === minha.codigoCaixa) : undefined;
  const aba = (v: 'elite' | 'top', t: string, n: number) => (
    <Link
      href={`/elite?${new URLSearchParams({ lista: v, uf, cidade })}`}
      className={`rounded-md px-3 py-1.5 text-sm ${lista === v ? 'bg-sky-600 text-white' : 'border border-zinc-300 dark:border-zinc-700'}`}
    >
      {t} <span className="tabular opacity-80">({fmtInt(n)})</span>
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Elite e Top da abertura</h1>
          <p className="text-sm text-zinc-500">
            {uf || 'Brasil'}
            {cidade ? ` · ${cidade}` : ''} · refeitas às {fmtHora(r.referencia).slice(0, 5)} de {fmtDataLonga(r.referencia)} · últimas {r.noites.length} noites
            {noites.length ? ` (${fmtDataCurta(noites[0]!.dia)} a ${fmtDataCurta(noites.at(-1)!.dia)})` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <a className="botao" href={`/api/raio-x/elite?${params}&formato=csv`}>
            CSV
          </a>
          <a className="botao" href={`/api/raio-x/elite?${params}&formato=xlsx`}>
            Excel
          </a>
        </div>
      </div>

      <section className="cartao space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {aba('elite', 'Elite', r.elite.length)}
          {aba('top', 'Top', r.top.length)}
          {minha ? (
            <span className="ml-auto text-sm text-zinc-500">
              {minha.nome}: {minhaNaLista ? `está na ${lista === 'top' ? 'Top' : 'Elite'} (${minhaNaLista.presencas}/${r.noites.length})` : `fora da ${lista === 'top' ? 'Top' : 'Elite'}`}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {lista === 'elite'
            ? 'Elite: abriu bolão nas 2 primeiras horas da abertura em TODAS as últimas 7 noites.'
            : 'Top: abriu bolão nas 2 primeiras horas da abertura em pelo menos 4 das últimas 7 noites (inclui a Elite).'}{' '}
          Conta também a noite em que a lotérica já tinha usado 90% da franquia antes da abertura (marcada com *). A Loteca não entra.
        </p>
        <FormFiltros>
          <input type="hidden" name="lista" value={lista} />
          <Seletor nome="uf" rotulo="UF" valor={uf} opcoes={[['', 'Brasil'], ...ufs.map((u) => [u, u] as [string, string])]} />
          <Seletor nome="cidade" rotulo="Cidade" valor={cidade} opcoes={[['', 'Todas'], ...(cidades[uf] ?? []).map((c) => [c, c] as [string, string])]} />
        </FormFiltros>
        <div className="overflow-x-auto">
          <table className="tabela min-w-[860px]">
            <thead>
              <tr>
                <th>Lotérica</th>
                <th>Cidade</th>
                <th className="text-right">Noites</th>
                <th>
                  {noites.map((n) => (
                    <span key={n.dia} className="inline-block w-6 text-center font-normal text-zinc-500">
                      {fmtDataCurta(n.dia).slice(0, 2)}
                    </span>
                  ))}
                </th>
                <th className="text-right">Franquia que resta*</th>
                <th>Fila média por modalidade</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {linhas.map((l) => {
                const porDia = new Map(l.noites.map((n) => [n.dia, n]));
                return (
                  <tr key={l.loterica.codigoCaixa} className={minha?.codigoCaixa === l.loterica.codigoCaixa ? 'bg-sky-50 dark:bg-sky-500/10' : ''}>
                    <td>
                      <Link className="link" href={`/lotericas/${l.loterica.codigoCaixa}`}>
                        {l.loterica.nome}
                      </Link>
                    </td>
                    <td className="text-zinc-500">
                      {l.loterica.cidade}/{l.loterica.uf}
                    </td>
                    <td className="text-right">
                      {l.presencas}/{r.noites.length}
                    </td>
                    <td>
                      {noites.map((n) => {
                        const p = porDia.get(n.dia);
                        return (
                          <span
                            key={n.dia}
                            title={`${fmtDataCurta(n.dia)}: ${p?.presente ? 'abriu' : p?.porFranquia ? 'franquia já 90% usada antes da abertura' : 'não abriu'}`}
                            className={`inline-block w-6 text-center ${p?.presente ? 'text-emerald-600' : p?.porFranquia ? 'text-amber-600' : 'text-zinc-300 dark:text-zinc-600'}`}
                          >
                            {p?.presente ? '●' : p?.porFranquia ? '*' : '·'}
                          </span>
                        );
                      })}
                    </td>
                    <td className="text-right">{fmtMoeda(l.franquiaMediaRestante)}</td>
                    <td className="text-zinc-600 dark:text-zinc-400">
                      {Object.entries(l.filaMedia)
                        .sort((a, b) => b[1] - a[1])
                        .map(([m, v]) => `${NOME_MODALIDADE[m] ?? m} ${String(v).replace('.', ',')}`)
                        .join(' · ') || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {linhas.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Nenhuma lotérica nesta lista para o local escolhido.</p> : null}
        </div>
        <p className="text-xs text-zinc-500">
          * Franquia que resta = média, nas 7 noites, do limite estimado (R$ 8.000 ou o maior uso diário visto em 30 dias) menos o valor sem tarifa
          inserido no dia; a franquia de outra lotérica não é pública. Fila média = bolões que ela pôs por abertura nas 2 primeiras horas.
        </p>
      </section>
    </div>
  );
}
