import { somarDias } from '@radar/core';
import { FormAcao, MensagemDaConsulta } from '@/components/FormAcao';
import { GestaoTopo, SemGestao } from '@/components/GestaoNav';
import { contexto } from '@/lib/contexto';
import { fmtDataCurta, fmtMoeda } from '@/lib/formato';
import { repositorioGestao } from '@/lib/gestao/ativo';
import { ErroGestao, painelFiados } from '@/lib/gestao/servico';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fiados' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Fiados({ searchParams }: Props) {
  const sp = await searchParams;
  const repo = repositorioGestao();
  const ctx = await contexto();
  if (!repo || !ctx) return <SemGestao />;
  let p;
  try {
    p = await painelFiados(repo, ctx, { loja: sp.loja });
  } catch (e) {
    if (e instanceof ErroGestao) return <div className="cartao text-sm">{e.message}</div>;
    throw e;
  }
  const nomeLoja = new Map(ctx.lojas.map((l) => [l.codigo, l.nome]));
  const varias = p.lojas.length > 1;
  return (
    <div className="space-y-6">
      <GestaoTopo ctx={ctx} atual="/gestao/fiados" titulo="Fiados" subtitulo={`${fmtMoeda(p.totalAberto)} em aberto · ${p.abertos.length} ${p.abertos.length === 1 ? 'fiado' : 'fiados'}`} loja={sp.loja} todas />
      <MensagemDaConsulta ok={sp.ok} erro={sp.erro} />

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Cobrança de hoje</h2>
        {p.cobranca.length ? (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {p.cobranca.map((i) => (
              <li key={i.id} className={`flex flex-wrap items-center justify-between gap-3 py-2 ${i.cobradoHoje ? 'opacity-60' : ''}`}>
                <div className="text-sm">
                  <strong>{i.cliente}</strong> · {fmtMoeda(i.saldo)} · {i.diasAtraso > 0 ? <span className="text-red-600 dark:text-red-400">{i.diasAtraso} dias de atraso</span> : 'vence hoje'}
                  {varias ? <span className="text-zinc-500"> · {nomeLoja.get(i.loja)}</span> : null}
                  {i.ultimaCobranca ? <span className="text-xs text-zinc-500"> · última cobrança {fmtDataCurta(i.ultimaCobranca)}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  {i.whatsapp ? (
                    <a className="botao" href={i.whatsapp} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  ) : (
                    <span className="text-xs text-zinc-500">sem telefone</span>
                  )}
                  {!i.cobradoHoje ? (
                    <FormAcao acao="/api/gestao/fiados">
                      <input type="hidden" name="acao" value="cobrei" />
                      <input type="hidden" name="id" value={i.id} />
                      <button type="submit" className="botao">
                        Cobrei
                      </button>
                    </FormAcao>
                  ) : (
                    <span className="text-xs text-emerald-700 dark:text-emerald-400">cobrado hoje</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Nada para cobrar hoje.</p>
        )}
      </section>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Em aberto</h2>
        <div className="overflow-x-auto">
          <table className="tabela min-w-[760px]">
            <thead>
              <tr>
                <th>Cliente</th>
                {varias ? <th>Lotérica</th> : null}
                <th>O quê</th>
                <th>Desde</th>
                <th>Vence</th>
                <th className="text-right">Saldo</th>
                <th>Receber</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {p.abertos.map((f) => (
                <tr key={f.id}>
                  <td>{f.dados.cliente}</td>
                  {varias ? <td className="text-zinc-500">{nomeLoja.get(f.loja)}</td> : null}
                  <td className="text-zinc-500">{f.dados.descricao}</td>
                  <td>{fmtDataCurta(f.dia!)}</td>
                  <td className={f.dados.vencimento < p.hoje ? 'text-red-600 dark:text-red-400' : ''}>{fmtDataCurta(f.dados.vencimento)}</td>
                  <td className="text-right">{fmtMoeda(f.saldo)}</td>
                  <td>
                    <FormAcao acao="/api/gestao/fiados" className="flex items-center gap-1">
                      <input type="hidden" name="acao" value="pagar" />
                      <input type="hidden" name="id" value={f.id} />
                      <input name="valor" inputMode="decimal" placeholder={f.saldo.toFixed(2).replace('.', ',')} className="campo w-24 py-1 text-xs" />
                      <select name="forma" className="campo py-1 text-xs">
                        <option value="dinheiro">dinheiro</option>
                        <option value="pix">Pix</option>
                        <option value="cartao">cartão</option>
                      </select>
                      <button type="submit" className="botao py-1 text-xs">
                        Receber
                      </button>
                    </FormAcao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!p.abertos.length ? <p className="py-4 text-center text-sm text-zinc-500">Nenhum fiado em aberto.</p> : null}
        </div>
      </section>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Anotar fiado</h2>
        <FormAcao acao="/api/gestao/fiados" limpar className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="acao" value="novo" />
          {ctx.lojas.length > 1 ? (
            <label className="flex flex-col gap-1">
              <span className="rotulo">Lotérica</span>
              <select name="loja" defaultValue={sp.loja ?? ctx.lojas[0]!.codigo} className="campo">
                {ctx.lojas.map((l) => (
                  <option key={l.codigo} value={l.codigo}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="loja" value={ctx.lojas[0]?.codigo ?? ''} />
          )}
          <label className="flex flex-col gap-1">
            <span className="rotulo">Cliente</span>
            <input name="cliente" required className="campo w-48" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">WhatsApp (opcional)</span>
            <input name="telefone" inputMode="tel" placeholder="(11) 90000-0000" className="campo w-40" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">O quê</span>
            <input name="descricao" placeholder="Bolão Mega 3100" className="campo w-48" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Valor</span>
            <input name="valor" required inputMode="decimal" className="campo w-28 tabular" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Vence</span>
            <input type="date" name="vencimento" defaultValue={somarDias(p.hoje, 7)} className="campo" />
          </label>
          <button type="submit" className="botao">
            Anotar
          </button>
        </FormAcao>
        <p className="text-xs text-zinc-500">Só nome e telefone do cliente da sua loja, para cobrar; ao remover o fiado, eles são apagados.</p>
      </section>

      {p.quitados.length ? (
        <section className="cartao space-y-2">
          <h2 className="font-semibold">Quitados (30 dias)</h2>
          <ul className="space-y-1 text-sm">
            {p.quitados.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {f.dados.cliente} · {fmtMoeda(f.dados.valor)} · quitado em {fmtDataCurta(f.quitadoEm!)}
                </span>
                <FormAcao acao="/api/gestao/fiados" confirmar="Apagar este fiado (e os dados do cliente)?">
                  <input type="hidden" name="acao" value="remover" />
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                    apagar
                  </button>
                </FormAcao>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
