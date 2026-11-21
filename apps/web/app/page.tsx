import Link from 'next/link';
import { BuscaLoterica } from '@/components/BuscaLoterica';
import { fonteDeDados } from '@/lib/dados';
import { fmtAtraso, fmtDataLonga, fmtHora, fmtPct, NOME_MODALIDADE } from '@/lib/formato';
import { rankingPeriodo } from '@/lib/servico';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  const fonte = fonteDeDados();
  const [minha, aberturas, ranking] = await Promise.all([
    fonte.minhaLoterica(),
    fonte.aberturas(),
    rankingPeriodo(fonte, { semanas: 1, criterio: 'mais_aberturas' }),
  ]);
  const recentes = [...aberturas].sort((a, b) => b.t0.getTime() - a.t0.getTime()).slice(0, 8);
  return (
    <div className="space-y-8">
      <section className="cartao flex flex-col items-start gap-4 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Raio-X de Abertura</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Para qualquer lotérica: quantas aberturas pegou na semana, em que dias, a que horas entrou o 1º bolão e em que colocação ficou na cidade, no estado e no Brasil.
          </p>
        </div>
        <BuscaLoterica grande />
        {minha ? (
          <p className="text-sm">
            Sua lotérica (demonstração):{' '}
            <Link className="link font-medium" href={`/lotericas/${minha.codigoCaixa}`}>
              {minha.nome} — {minha.cidade}/{minha.uf}
            </Link>
            {' · '}
            <Link className="link" href={`/ao-vivo?uf=${minha.uf}&destaque=${minha.codigoCaixa}`}>
              acompanhar a abertura ao vivo
            </Link>
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="cartao">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold">Quem mais abriu nesta semana (Brasil)</h2>
            <Link href="/ranking" className="link text-sm">
              ranking completo
            </Link>
          </div>
          <table className="tabela">
            <thead>
              <tr>
                <th>#</th>
                <th>Lotérica</th>
                <th className="text-right">Aberturas</th>
                <th className="text-right">Atraso mediano</th>
                <th className="text-right">Pág. 1 (UF)</th>
              </tr>
            </thead>
            <tbody>
              {ranking.linhas.slice(0, 10).map((l) => (
                <tr key={l.loterica.codigoCaixa}>
                  <td className="tabular text-zinc-500">{l.posicao}</td>
                  <td>
                    <Link className="link" href={`/lotericas/${l.loterica.codigoCaixa}`}>
                      {l.loterica.nome}
                    </Link>
                    <span className="ml-1 text-xs text-zinc-500">
                      {l.loterica.cidade}/{l.loterica.uf}
                    </span>
                  </td>
                  <td className="tabular text-right">
                    {l.participacoes}/{l.aberturasOcorridas}
                  </td>
                  <td className="tabular text-right">{fmtAtraso(l.atrasoMedianoS)}</td>
                  <td className="tabular text-right">{fmtPct(l.pctPagina1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="cartao">
          <h2 className="mb-3 font-semibold">Últimas aberturas</h2>
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {recentes.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <Link className="link" href={`/aberturas/${a.id}`}>
                  {NOME_MODALIDADE[a.modalidade]} {a.concurso}
                </Link>
                <span className="tabular text-xs text-zinc-500">
                  {fmtDataLonga(a.t0)} · T0 {fmtHora(a.t0)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
