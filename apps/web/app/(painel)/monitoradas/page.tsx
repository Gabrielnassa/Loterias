import Link from 'next/link';
import { MODALIDADES, RESUMO_SEMANAL } from '@radar/core';
import { FormAcao, MensagemDaConsulta } from '@/components/FormAcao';
import { repositorioAvisos } from '@/lib/avisos/ativo';
import { painelMonitoradas, sincronizarAlertasSimulados } from '@/lib/avisos/painel';
import { contexto } from '@/lib/contexto';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtAtraso, fmtDataCurta, fmtHora, fmtPct } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Monitoradas' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Monitoradas({ searchParams }: Props) {
  const sp = await searchParams;
  const repo = repositorioAvisos();
  const ctx = await contexto();
  const fonte = fonteDeDados();
  if (!repo || !ctx?.conta) {
    return (
      <div className="cartao space-y-2 text-sm">
        <h1 className="text-lg font-semibold">Monitoradas</h1>
        <p>A lista de monitoradas e os alertas precisam das contas ligadas (DATABASE_URL, ou RADAR_AUTH=memoria para testar).</p>
      </div>
    );
  }
  await sincronizarAlertasSimulados(repo, fonte, ctx);
  const [p, busca, recentes] = await Promise.all([
    painelMonitoradas(repo, fonte, ctx),
    sp.q ? fonte.buscar(sp.q, 12) : Promise.resolve([]),
    repo.notificacoes(ctx.usuario.id, 40).then((ns) => ns.filter((n) => n.categoria === 'monitorada-abertura').slice(0, 8)),
  ]);
  const ja = new Set(p.linhas.map((l) => l.codigo));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Monitoradas</h1>
        <p className="text-sm text-zinc-500">
          Concorrentes que você acompanha: um aviso quando entram na abertura e o resumo toda segunda às {RESUMO_SEMANAL.hora}.{' '}
          <Link className="link" href="/notificacoes">
            Preferências de aviso
          </Link>
        </p>
      </div>
      <MensagemDaConsulta ok={sp.ok} erro={sp.erro} />

      <section className="cartao space-y-3">
        <div className="overflow-x-auto">
          <table className="tabela min-w-[760px]">
            <thead>
              <tr>
                <th>Lotérica</th>
                <th>Cidade</th>
                <th className="text-right">Semana</th>
                <th className="text-right">Atraso mediano</th>
                <th className="text-right">Pág. 1</th>
                <th>Última entrada</th>
                <th />
              </tr>
            </thead>
            <tbody className="tabular">
              {p.linhas.map((l) => (
                <tr key={l.codigo}>
                  <td>
                    <Link className="link" href={`/lotericas/${l.codigo}`}>
                      {l.apelido ?? l.loterica.nome}
                    </Link>
                    {l.apelido ? <span className="ml-1 text-xs text-zinc-500">{l.loterica.nome}</span> : null}
                  </td>
                  <td className="text-zinc-500">{l.loterica.cidade ? `${l.loterica.cidade}/${l.loterica.uf}` : '—'}</td>
                  <td className="text-right">{l.semana ? `${l.semana.participacoes}/${l.semana.aberturasOcorridas}` : '—'}</td>
                  <td className="text-right">{fmtAtraso(l.semana?.atrasoMedianoS)}</td>
                  <td className="text-right">{fmtPct(l.semana?.pctPagina1)}</td>
                  <td className="text-sm">
                    {l.ultima ? (
                      <Link className="link" href={`/aberturas/${l.ultima.aberturaId}`}>
                        {MODALIDADES[l.ultima.abertura.modalidade]?.nome} {fmtDataCurta(l.ultima.primeiroEm)} {fmtHora(l.ultima.primeiroEm)} ({fmtAtraso(l.ultima.atrasoS)}), {l.ultima.posUf}º
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-right">
                    <FormAcao acao="/api/monitoradas">
                      <input type="hidden" name="acao" value="remover" />
                      <input type="hidden" name="codigo" value={l.codigo} />
                      <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                        parar
                      </button>
                    </FormAcao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!p.linhas.length ? <p className="py-6 text-center text-sm text-zinc-500">Nenhuma monitorada ainda. Busque uma lotérica abaixo.</p> : null}
        </div>
      </section>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Adicionar</h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1">
            <span className="rotulo">Buscar lotérica</span>
            <input name="q" defaultValue={sp.q ?? ''} placeholder="Nome, cidade ou código" className="campo" />
          </label>
          <button type="submit" className="botao">
            Buscar
          </button>
        </form>
        {busca.length ? (
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {busca.map((l) => (
              <li key={l.codigoCaixa} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {l.nome} <span className="text-zinc-500">· {l.cidade}/{l.uf} · {l.codigoCaixa}</span>
                </span>
                {ja.has(l.codigoCaixa) ? (
                  <span className="text-xs text-zinc-500">já monitorada</span>
                ) : (
                  <FormAcao acao="/api/monitoradas">
                    <input type="hidden" name="acao" value="adicionar" />
                    <input type="hidden" name="codigo" value={l.codigoCaixa} />
                    <button type="submit" className="botao">
                      Monitorar
                    </button>
                  </FormAcao>
                )}
              </li>
            ))}
          </ul>
        ) : sp.q ? (
          <p className="text-sm text-zinc-500">Nenhuma lotérica encontrada.</p>
        ) : null}
      </section>

      {recentes.length ? (
        <section className="cartao space-y-2">
          <h2 className="font-semibold">Últimos avisos de abertura</h2>
          <ul className="space-y-1 text-sm">
            {recentes.map((n) => (
              <li key={n.id}>
                <span className="text-zinc-500 tabular">{fmtDataCurta(n.criadoEm)} </span>
                <strong>{n.titulo}</strong> · {n.corpo}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
