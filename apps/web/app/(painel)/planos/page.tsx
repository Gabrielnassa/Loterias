import Link from 'next/link';
import { planoQueLibera, TELAS, type PlanoId } from '@radar/core';
import { FormAcao, MensagemDaConsulta } from '@/components/FormAcao';
import { repositorioContas } from '@/lib/contas/ativo';
import { contexto } from '@/lib/contexto';
import { fmtDataCurta, fmtMoeda } from '@/lib/formato';
import { asaasAtivo } from '@/lib/planos/asaas';
import { ErroPlano, painelPlano } from '@/lib/planos/cobranca';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plano' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const STATUS: Record<string, string> = { PENDING: 'aguardando', RECEIVED: 'paga', CONFIRMED: 'paga', RECEIVED_IN_CASH: 'paga', OVERDUE: 'vencida', REFUNDED: 'estornada' };
const MOTIVO: Record<string, string> = { teste: 'teste grátis', pago: 'pago', tolerancia: 'pagamento pendente', cortesia: 'cortesia', gratis: 'grátis' };

export default async function Planos({ searchParams }: Props) {
  const sp = await searchParams;
  const repo = repositorioContas();
  const ctx = await contexto();
  if (!repo || !ctx) {
    return (
      <div className="cartao space-y-2 text-sm">
        <h1 className="text-lg font-semibold">Plano</h1>
        <p>Sem contas ligadas (sem banco), o painel não tem planos: tudo fica liberado.</p>
      </div>
    );
  }
  let p;
  try {
    p = await painelPlano(repo, asaasAtivo(), ctx, new Date());
  } catch (e) {
    if (e instanceof ErroPlano) return <div className="cartao text-sm">{e.message}</div>;
    throw e;
  }
  const telaPedida = TELAS.find((t) => t.id === sp.tela);
  const libera = telaPedida ? planoQueLibera(telaPedida.id) : null;
  const atual = p.efetivo.id;
  const escolhido = (sp.plano as PlanoId | undefined) ?? (libera?.id !== 'gratis' ? libera?.id : undefined) ?? (p.assinatura.plano === 'gratis' ? 'pro' : p.assinatura.plano);
  const temAssinatura = !!p.assinatura.asaasAssinaturaId && p.assinatura.status !== 'cancelada';
  const nomeTela = (id: string) => TELAS.find((t) => t.id === id)?.nome.split(' (')[0] ?? id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Plano</h1>
        <p className="text-sm text-zinc-500">
          Conta {ctx.conta?.nome} · agora: <strong>{p.planos.find((x) => x.id === atual)?.nome}</strong> ({MOTIVO[p.efetivo.motivo]}
          {p.efetivo.diasRestantesTeste ? `, faltam ${p.efetivo.diasRestantesTeste} dias` : ''})
        </p>
      </div>
      <MensagemDaConsulta ok={sp.ok} erro={sp.erro} />
      {telaPedida && libera ? (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">
          <strong>{nomeTela(telaPedida.id)}</strong> faz parte do plano <strong>{libera.nome}</strong>.
        </p>
      ) : null}
      {p.efetivo.aviso ? <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{p.efetivo.aviso}</p> : null}
      <p className="text-xs text-zinc-500">
        {p.modo === 'simulado'
          ? 'Cobrança SIMULADA (o Asaas não está configurado): nenhuma cobrança real é criada; use "Simular pagamento" para testar.'
          : 'Asaas em modo SANDBOX (teste): nenhum dinheiro de verdade.'}{' '}
        O cartão é digitado na página do próprio Asaas; o Radar não vê os dados do cartão.
      </p>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {p.planos.map((x) => (
          <div key={x.id} className={`cartao flex flex-col gap-2 ${x.id === atual ? 'ring-2 ring-sky-500' : ''}`}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{x.nome}</h2>
              {x.id === atual ? <span className="text-xs text-sky-600">atual</span> : null}
            </div>
            <p className="text-2xl font-semibold tabular">
              {x.precoMensal ? fmtMoeda(x.precoMensal) : 'R$ 0'}
              <span className="text-sm font-normal text-zinc-500">/mês</span>
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{x.resumo}</p>
            <p className="text-xs text-zinc-500">
              até {x.limites.lojas} {x.limites.lojas === 1 ? 'lotérica' : 'lotéricas'} · {x.limites.pessoas} pessoas · {x.limites.monitoradas} monitoradas
            </p>
            <details className="text-xs text-zinc-600 dark:text-zinc-400">
              <summary className="cursor-pointer">Telas incluídas</summary>
              <ul className="mt-1 list-inside list-disc">
                {x.telas.map((t) => (
                  <li key={t}>{nomeTela(t)}</li>
                ))}
              </ul>
            </details>
            {x.id !== 'gratis' ? (
              <Link className="botao mt-auto text-center" href={`/planos?plano=${x.id}#assinar`}>
                {temAssinatura && p.assinatura.plano === x.id ? 'Seu plano' : temAssinatura ? 'Trocar para este' : 'Escolher'}
              </Link>
            ) : null}
          </div>
        ))}
      </section>

      <section id="assinar" className="cartao space-y-3">
        <h2 className="font-semibold">{temAssinatura ? 'Trocar de plano ou forma de pagamento' : 'Assinar'}</h2>
        {p.efetivo.motivo === 'teste' && !temAssinatura ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Assinando agora, a 1ª cobrança vence só no fim do teste grátis.</p>
        ) : null}
        <FormAcao acao="/api/planos" className="space-y-3">
          <input type="hidden" name="acao" value="assinar" />
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="rotulo">Plano</span>
              <select name="plano" defaultValue={escolhido} className="campo">
                {p.planos
                  .filter((x) => x.id !== 'gratis')
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome} · {fmtMoeda(x.precoMensal)}/mês
                    </option>
                  ))}
              </select>
            </label>
            <fieldset className="flex items-center gap-4 text-sm">
              <legend className="rotulo mb-1">Pagamento</legend>
              <label className="flex items-center gap-1">
                <input type="radio" name="forma" value="PIX" defaultChecked={p.assinatura.forma !== 'CREDIT_CARD'} /> Pix
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="forma" value="CREDIT_CARD" defaultChecked={p.assinatura.forma === 'CREDIT_CARD'} /> Cartão (recorrente)
              </label>
            </fieldset>
          </div>
          {!p.assinatura.asaasClienteId ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="rotulo">CPF ou CNPJ de quem paga</span>
                <input name="cpf_cnpj" required inputMode="numeric" className="campo w-56" placeholder="00.000.000/0000-00" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="rotulo">Nome na cobrança</span>
                <input name="nome" defaultValue={ctx.conta?.nome} className="campo w-64" />
              </label>
            </div>
          ) : null}
          <button type="submit" className="botao">
            {temAssinatura ? 'Salvar a troca' : 'Assinar'}
          </button>
        </FormAcao>
      </section>

      {p.pendente ? (
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Cobrança em aberto</h2>
          <p className="text-sm">
            {fmtMoeda(p.pendente.valor)} · vence em {p.pendente.vencimento.split('-').reverse().join('/')} · {p.pendente.forma === 'CREDIT_CARD' ? 'cartão' : 'Pix'} ·{' '}
            {STATUS[p.pendente.status] ?? p.pendente.status}
          </p>
          {p.pix ? (
            <div className="flex flex-wrap items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/png;base64,${p.pix.imagemBase64}`} alt="QR Code do Pix" className="size-40 rounded border" />
              <label className="flex min-w-64 flex-1 flex-col gap-1">
                <span className="rotulo">Pix copia e cola</span>
                <textarea readOnly rows={4} className="campo font-mono text-xs" defaultValue={p.pix.copiaECola} />
              </label>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {p.pendente.link ? (
              <a className="botao" href={p.pendente.link} target="_blank" rel="noopener noreferrer">
                Pagar no Asaas
              </a>
            ) : null}
            {p.modo === 'simulado' ? (
              <FormAcao acao="/api/planos">
                <input type="hidden" name="acao" value="simular-pagamento" />
                <input type="hidden" name="cobranca" value={p.pendente.id} />
                <button type="submit" className="botao">
                  Simular pagamento confirmado
                </button>
              </FormAcao>
            ) : null}
          </div>
        </section>
      ) : null}

      {p.cobrancas.length ? (
        <section className="cartao space-y-2">
          <h2 className="font-semibold">Cobranças</h2>
          <div className="overflow-x-auto">
            <table className="tabela min-w-[520px]">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th className="text-right">Valor</th>
                  <th>Forma</th>
                  <th>Situação</th>
                  <th>Pago em</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {p.cobrancas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.vencimento.split('-').reverse().join('/')}</td>
                    <td className="text-right">{fmtMoeda(c.valor)}</td>
                    <td>{c.forma === 'CREDIT_CARD' ? 'cartão' : c.forma === 'PIX' ? 'Pix' : (c.forma ?? '—')}</td>
                    <td>{STATUS[c.status] ?? c.status}</td>
                    <td>{c.pagoEm ? fmtDataCurta(c.pagoEm) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {temAssinatura ? (
        <section className="cartao space-y-2">
          <h2 className="font-semibold">Cancelar</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">O plano continua até o fim do período já pago; depois a conta volta para o Grátis (nada é apagado).</p>
          <FormAcao acao="/api/planos" confirmar="Cancelar a assinatura?">
            <input type="hidden" name="acao" value="cancelar" />
            <button type="submit" className="text-sm text-red-600 underline-offset-2 hover:underline">
              Cancelar a assinatura
            </button>
          </FormAcao>
        </section>
      ) : null}
    </div>
  );
}
