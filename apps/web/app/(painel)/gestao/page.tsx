import Link from 'next/link';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, nomeCategoria, somarMes } from '@radar/core';
import { FormAcao, MensagemDaConsulta } from '@/components/FormAcao';
import { GestaoTopo, SemGestao } from '@/components/GestaoNav';
import { contexto } from '@/lib/contexto';
import { fmtDataCurta, fmtMoeda } from '@/lib/formato';
import { repositorioGestao } from '@/lib/gestao/ativo';
import { ErroGestao, painelFinanceiro } from '@/lib/gestao/servico';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fluxo de caixa e despesas' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;

export default async function Financeiro({ searchParams }: Props) {
  const sp = await searchParams;
  const repo = repositorioGestao();
  const ctx = await contexto();
  if (!repo || !ctx) return <SemGestao />;
  let p;
  try {
    p = await painelFinanceiro(repo, ctx, { loja: sp.loja, mes: sp.mes });
  } catch (e) {
    if (e instanceof ErroGestao) return <div className="cartao text-sm">{e.message}</div>;
    throw e;
  }
  const nomeLoja = new Map(ctx.lojas.map((l) => [l.codigo, l.nome]));
  const varias = p.lojas.length > 1;
  const q = (m: string) => `/gestao?${new URLSearchParams({ ...(sp.loja ? { loja: sp.loja } : {}), mes: m })}`;
  const lojaForm = (
    <label className="flex flex-col gap-1">
      <span className="rotulo">Lotérica</span>
      <select name="loja" defaultValue={p.lojas.length === 1 ? p.lojas[0] : ctx.lojas[0]?.codigo} className="campo">
        {ctx.lojas.map((l) => (
          <option key={l.codigo} value={l.codigo}>
            {l.nome}
          </option>
        ))}
      </select>
    </label>
  );
  const aPagar = p.despesas.filter((d) => !d.paga);
  return (
    <div className="space-y-6">
      <GestaoTopo
        ctx={ctx}
        atual="/gestao"
        titulo="Fluxo de caixa e despesas"
        subtitulo={`${varias ? 'Todas as lotéricas' : nomeLoja.get(p.lojas[0]!)} · ${nomeMes(p.mes)} · dinheiro da lotérica (não inclui a arrecadação da CAIXA)`}
        loja={sp.loja}
        todas
        extra={
          <div className="flex items-center gap-2 text-sm">
            <Link className="botao" href={q(somarMes(p.mes, -1))}>
              ‹ {nomeMes(somarMes(p.mes, -1))}
            </Link>
            <Link className="botao" href={q(somarMes(p.mes, 1))}>
              {nomeMes(somarMes(p.mes, 1))} ›
            </Link>
          </div>
        }
      />
      <MensagemDaConsulta ok={sp.ok} erro={sp.erro} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Receitas do mês', p.receitaBruta, ''],
          ['Despesas e impostos', p.despesasTotal, ''],
          ['Resultado (DRE)', p.resultado, p.resultado < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'],
          ['Saldo no fim do mês', p.fluxo.saldoFinal, ''],
        ].map(([t, v, c]) => (
          <div key={t as string} className="cartao">
            <p className="rotulo">{t}</p>
            <p className={`text-xl font-semibold tabular ${c}`}>{fmtMoeda(v as number)}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="cartao space-y-3">
          <h2 className="font-semibold">Fluxo de caixa</h2>
          <table className="tabela">
            <thead>
              <tr>
                <th>Dia</th>
                <th className="text-right">Entradas</th>
                <th className="text-right">Saídas</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="tabular">
              <tr className="text-zinc-500">
                <td>saldo anterior</td>
                <td />
                <td />
                <td className="text-right">{fmtMoeda(p.fluxo.saldoInicial)}</td>
              </tr>
              {p.fluxo.dias.map((d) => (
                <tr key={d.dia}>
                  <td>{fmtDataCurta(d.dia)}</td>
                  <td className="text-right">{d.entradas ? fmtMoeda(d.entradas) : ''}</td>
                  <td className="text-right">{d.saidas ? fmtMoeda(d.saidas) : ''}</td>
                  <td className={`text-right ${d.saldo < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{fmtMoeda(d.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!p.fluxo.dias.length ? <p className="text-sm text-zinc-500">Nenhum lançamento neste mês.</p> : null}
        </div>

        <div className="cartao space-y-3">
          <h2 className="font-semibold">Despesas fixas de {nomeMes(p.mes)}</h2>
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {p.despesas.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {d.descricao} · {fmtMoeda(d.valor)} · vence {fmtDataCurta(d.vencimento)}
                  {varias ? <span className="text-zinc-500"> · {nomeLoja.get(d.loja)}</span> : null}
                </span>
                {d.paga ? (
                  <span className="text-xs text-emerald-700 dark:text-emerald-400">paga</span>
                ) : (
                  <FormAcao acao="/api/gestao" className="flex items-center gap-1">
                    <input type="hidden" name="acao" value="pagar-despesa" />
                    <input type="hidden" name="id" value={d.id} />
                    {d.atrasada ? <span className="text-xs text-red-600 dark:text-red-400">atrasada</span> : null}
                    <select name="forma" className="campo py-1 text-xs">
                      <option value="banco">banco</option>
                      <option value="dinheiro">dinheiro</option>
                    </select>
                    <button type="submit" className="botao py-1 text-xs">
                      Paguei
                    </button>
                  </FormAcao>
                )}
              </li>
            ))}
            {!p.despesas.length ? <li className="py-2 text-zinc-500">Cadastre aluguel, folha, energia, internet… abaixo.</li> : null}
          </ul>
          {aPagar.length ? <p className="text-xs text-zinc-500">A pagar no mês: {fmtMoeda(aPagar.reduce((s, d) => s + d.valor, 0))}</p> : null}
          <details className="text-sm">
            <summary className="cursor-pointer text-sky-700 dark:text-sky-400">Cadastrar despesa fixa</summary>
            <FormAcao acao="/api/gestao" limpar className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="acao" value="despesa-fixa" />
              {lojaForm}
              <label className="flex flex-col gap-1">
                <span className="rotulo">Descrição</span>
                <input name="descricao" required className="campo w-40" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="rotulo">Categoria</span>
                <select name="categoria" className="campo">
                  {CATEGORIAS_DESPESA.map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="rotulo">Valor</span>
                <input name="valor" required inputMode="decimal" className="campo w-24" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="rotulo">Dia</span>
                <input name="dia_vencimento" required type="number" min={1} max={31} defaultValue={10} className="campo w-16" />
              </label>
              <button type="submit" className="botao">
                Salvar
              </button>
            </FormAcao>
          </details>
          {p.fixas.length ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-500">Remover uma despesa fixa</summary>
              <ul className="mt-2 space-y-1">
                {p.fixas.map((f) => (
                  <li key={f.id} className="flex items-center justify-between">
                    <span>{f.dados.descricao}</span>
                    <FormAcao acao="/api/gestao" confirmar={`Remover ${f.dados.descricao}?`}>
                      <input type="hidden" name="acao" value="remover-despesa-fixa" />
                      <input type="hidden" name="id" value={f.id} />
                      <button type="submit" className="text-zinc-500 underline-offset-2 hover:underline">
                        remover
                      </button>
                    </FormAcao>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </section>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Lançar receita ou despesa</h2>
        <FormAcao acao="/api/gestao" limpar className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="acao" value="lancamento" />
          {lojaForm}
          <label className="flex flex-col gap-1">
            <span className="rotulo">Tipo</span>
            <select name="tipo" className="campo">
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
              <option value="saldo-inicial">Saldo inicial</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Categoria</span>
            <select name="categoria" className="campo">
              <optgroup label="Receitas">
                {CATEGORIAS_RECEITA.map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Despesas">
                {CATEGORIAS_DESPESA.map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Descrição</span>
            <input name="descricao" className="campo w-48" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Valor</span>
            <input name="valor" required inputMode="decimal" className="campo w-28" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Dia</span>
            <input type="date" name="dia" defaultValue={p.hoje} className="campo" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Onde</span>
            <select name="forma" className="campo">
              <option value="banco">Banco</option>
              <option value="dinheiro">Dinheiro</option>
            </select>
          </label>
          <button type="submit" className="botao">
            Lançar
          </button>
        </FormAcao>
        <p className="text-xs text-zinc-500">
          A remuneração da CAIXA (comissões e tarifas de serviços) vem do demonstrativo mensal; as tarifas de bolão estão no Financeiro MKP da Minha lotérica.
        </p>
      </section>

      {p.lancamentosDoMes.length ? (
        <section className="cartao space-y-2">
          <h2 className="font-semibold">Lançamentos de {nomeMes(p.mes)}</h2>
          <div className="overflow-x-auto">
            <table className="tabela min-w-[640px]">
              <thead>
                <tr>
                  <th>Dia</th>
                  {varias ? <th>Lotérica</th> : null}
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th className="text-right">Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody className="tabular">
                {p.lancamentosDoMes.map((l) => (
                  <tr key={l.id}>
                    <td>{fmtDataCurta(l.dia)}</td>
                    {varias ? <td className="text-zinc-500">{nomeLoja.get(l.loja)}</td> : null}
                    <td>{l.dados.descricao}</td>
                    <td className="text-zinc-500">{l.dados.tipo === 'saldo-inicial' ? 'saldo inicial' : nomeCategoria(l.dados.categoria).split(' (')[0]}</td>
                    <td className={`text-right ${l.dados.tipo === 'despesa' ? 'text-red-600 dark:text-red-400' : ''}`}>{fmtMoeda(l.dados.tipo === 'despesa' ? -l.dados.valor : l.dados.valor)}</td>
                    <td className="text-right">
                      <FormAcao acao="/api/gestao" confirmar="Remover este lançamento?">
                        <input type="hidden" name="acao" value="remover-lancamento" />
                        <input type="hidden" name="id" value={l.id} />
                        <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                          remover
                        </button>
                      </FormAcao>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
