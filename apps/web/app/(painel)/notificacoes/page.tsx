import Link from 'next/link';
import { MODOS_VENDAS, NOME_CATEGORIA, RESUMO_SEMANAL } from '@radar/core';
import { FormAcao, MensagemDaConsulta } from '@/components/FormAcao';
import { PushAparelho } from '@/components/PushAparelho';
import { chavePublicaVapid, repositorioAvisos } from '@/lib/avisos/ativo';
import { sincronizarAlertasSimulados } from '@/lib/avisos/painel';
import { contexto } from '@/lib/contexto';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtDataCurta, fmtHora } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notificações' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const OPCOES: [string, string][] = [
  ['monitoradas', 'Monitorada entrou na abertura'],
  ['resumoSemanal', `Resumo semanal das monitoradas (segunda, ${RESUMO_SEMANAL.hora})`],
  ['resultados', 'Resultados dos sorteios'],
  ['previsaoZerar', 'Previsão de zerar mantida por 45 min'],
  ['premios', 'Prêmios na lotérica'],
];

export default async function Notificacoes({ searchParams }: Props) {
  const sp = await searchParams;
  const repo = repositorioAvisos();
  const ctx = await contexto();
  if (!repo || !ctx) {
    return (
      <div className="cartao space-y-2 text-sm">
        <h1 className="text-lg font-semibold">Notificações</h1>
        <p>A central de notificações e o push precisam das contas ligadas (DATABASE_URL, ou RADAR_AUTH=memoria para testar).</p>
      </div>
    );
  }
  await sincronizarAlertasSimulados(repo, fonteDeDados(), ctx);
  const [lista, aparelhos, naoLidas] = await Promise.all([repo.notificacoes(ctx.usuario.id, 60), repo.aparelhos(ctx.usuario.id), repo.naoLidas(ctx.usuario.id)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Notificações</h1>
          <p className="text-sm text-zinc-500">{naoLidas ? `${naoLidas} não lidas` : 'Tudo lido'} · preferências por aparelho</p>
        </div>
        {naoLidas ? (
          <FormAcao acao="/api/notificacoes">
            <input type="hidden" name="acao" value="ler-todas" />
            <button type="submit" className="botao">
              Marcar todas como lidas
            </button>
          </FormAcao>
        ) : null}
      </div>
      <MensagemDaConsulta ok={sp.ok} erro={sp.erro} />

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Este aparelho</h2>
        <PushAparelho chavePublica={chavePublicaVapid()} aparelhos={aparelhos.map((a) => ({ id: a.id, endpoint: a.endpoint }))} />
        <p className="text-xs text-zinc-500">
          Instale o Radar como aplicativo (menu do navegador › Instalar / Adicionar à Tela de Início) para receber os avisos mesmo com ele fechado.
        </p>
      </section>

      {aparelhos.length ? (
        <section className="cartao space-y-4">
          <h2 className="font-semibold">Seus aparelhos e o que cada um recebe</h2>
          {aparelhos.map((a) => (
            <div key={a.id} className="space-y-3 border-t border-zinc-100 pt-3 first:border-0 first:pt-0 dark:border-zinc-800">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{a.nome ?? 'Aparelho'}</span>
                <span className="text-xs text-zinc-500">ligado em {fmtDataCurta(a.criadoEm)}</span>
              </div>
              <FormAcao acao="/api/notificacoes" className="space-y-3">
                <input type="hidden" name="acao" value="preferencias" />
                <input type="hidden" name="aparelho" value={a.id} />
                <fieldset className="space-y-1">
                  <legend className="rotulo">Vendas da sua lotérica</legend>
                  {MODOS_VENDAS.map(([v, t]) => (
                    <label key={v} className="flex items-center gap-2 text-sm">
                      <input type="radio" name="vendas" value={v} defaultChecked={a.preferencias.vendas === v} />
                      {t}
                    </label>
                  ))}
                </fieldset>
                <fieldset className="space-y-1">
                  <legend className="rotulo">Também avisar</legend>
                  {OPCOES.map(([k, t]) => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name={k} value="1" defaultChecked={a.preferencias[k as keyof typeof a.preferencias] === true} />
                      {t}
                    </label>
                  ))}
                </fieldset>
                <button type="submit" className="botao">
                  Salvar deste aparelho
                </button>
              </FormAcao>
              <FormAcao acao="/api/notificacoes" confirmar="Parar o push neste aparelho?">
                <input type="hidden" name="acao" value="remover-aparelho" />
                <input type="hidden" name="aparelho" value={a.id} />
                <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                  remover aparelho
                </button>
              </FormAcao>
            </div>
          ))}
        </section>
      ) : null}

      <section className="cartao space-y-2">
        <h2 className="font-semibold">Central</h2>
        {lista.length ? (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {lista.map((n) => (
              <li key={n.id} className={`flex gap-3 py-3 ${n.lidaEm ? 'opacity-70' : ''}`}>
                <span aria-hidden className={`mt-1.5 inline-block size-2 shrink-0 rounded-full ${n.lidaEm ? 'bg-transparent' : 'bg-sky-500'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    {n.url ? (
                      <Link className="font-medium hover:underline" href={n.url}>
                        {n.titulo}
                      </Link>
                    ) : (
                      <span className="font-medium">{n.titulo}</span>
                    )}
                    <span className="text-xs text-zinc-500 tabular">
                      {fmtDataCurta(n.criadoEm)} {fmtHora(n.criadoEm).slice(0, 5)}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{n.corpo}</p>
                  <p className="text-xs text-zinc-400">{NOME_CATEGORIA[n.categoria] ?? n.categoria}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-zinc-500">
            Nada por aqui ainda. Escolha lotéricas em{' '}
            <Link className="link" href="/monitoradas">
              Monitoradas
            </Link>{' '}
            para saber quando entram na abertura.
          </p>
        )}
      </section>
    </div>
  );
}
