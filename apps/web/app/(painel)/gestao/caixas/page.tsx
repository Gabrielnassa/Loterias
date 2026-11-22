import { FormAcao, MensagemDaConsulta } from '@/components/FormAcao';
import { GestaoTopo, SemGestao } from '@/components/GestaoNav';
import { contexto } from '@/lib/contexto';
import { fmtDataCurta, fmtMoeda } from '@/lib/formato';
import { repositorioGestao } from '@/lib/gestao/ativo';
import { ErroGestao, painelCaixas } from '@/lib/gestao/servico';
import { somarDias } from '@radar/core';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Caixas e cofre' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const CAMPOS: [string, string, string][] = [
  ['troco_inicial', 'Troco inicial', 'trocoInicial'],
  ['entradas', 'Entradas (dinheiro)', 'entradas'],
  ['saidas', 'Saídas (prêmios, saques)', 'saidas'],
  ['sangrias', 'Sangrias (ao cofre)', 'sangrias'],
  ['suprimentos', 'Suprimentos (do cofre)', 'suprimentos'],
  ['contado', 'Dinheiro contado', 'contado'],
  ['eletronico', 'Cartão/Pix (informativo)', 'eletronico'],
];

const valor = (n: number | undefined) => (n ? n.toFixed(2).replace('.', ',') : '');
const cor = (d: number) => (Math.abs(d) <= 0.5 ? 'text-emerald-700 dark:text-emerald-400' : d < 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600');

export default async function Caixas({ searchParams }: Props) {
  const sp = await searchParams;
  const repo = repositorioGestao();
  const ctx = await contexto();
  if (!repo || !ctx) return <SemGestao />;
  let p;
  try {
    p = await painelCaixas(repo, ctx, { loja: sp.loja, dia: sp.dia });
  } catch (e) {
    if (e instanceof ErroGestao) return <div className="cartao text-sm">{e.message}</div>;
    throw e;
  }
  const ativos = p.caixas.filter((c) => c.dados.ativo);
  const nomeLoja = ctx.lojas.find((l) => l.codigo === p.loja)?.nome ?? p.loja;
  return (
    <div className="space-y-6">
      <GestaoTopo
        ctx={ctx}
        atual="/gestao/caixas"
        titulo="Caixas e cofre"
        subtitulo={`${nomeLoja} · fechamento de ${fmtDataCurta(p.dia)}`}
        loja={p.loja}
        extra={
          <form method="get" className="flex items-end gap-2">
            <input type="hidden" name="loja" value={p.loja} />
            <label className="flex flex-col gap-1">
              <span className="rotulo">Dia</span>
              <input type="date" name="dia" defaultValue={p.dia} max={p.hoje} className="campo" />
            </label>
            <button type="submit" className="botao">
              Abrir
            </button>
          </form>
        }
      />
      <MensagemDaConsulta ok={sp.ok} erro={sp.erro} />

      <section className="grid gap-4 lg:grid-cols-2">
        {ativos.map((c) => (
          <div key={c.id} className="cartao space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">
                {c.dados.nome} <span className="text-xs font-normal text-zinc-500">{c.dados.tipo === 'tfl' ? 'TFL' : 'caixa extra'}</span>
              </h2>
              {c.resumo ? (
                <span className={`text-sm font-medium tabular ${cor(c.resumo.diferenca)}`}>
                  {c.resumo.situacao === 'ok' ? 'bateu' : `${c.resumo.situacao} ${fmtMoeda(Math.abs(c.resumo.diferenca))}`}
                </span>
              ) : (
                <span className="text-xs text-zinc-500">não fechado</span>
              )}
            </div>
            <FormAcao acao="/api/gestao/caixas" className="space-y-3">
              <input type="hidden" name="acao" value="fechar" />
              <input type="hidden" name="loja" value={p.loja} />
              <input type="hidden" name="dia" value={p.dia} />
              <input type="hidden" name="caixa" value={c.id} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CAMPOS.map(([nome, rotulo, chave]) => (
                  <label key={nome} className="flex flex-col gap-1">
                    <span className="rotulo">{rotulo}</span>
                    <input name={nome} inputMode="decimal" defaultValue={valor(c.fechamento?.dados[chave as keyof typeof c.fechamento.dados] as number | undefined)} placeholder="0,00" className="campo tabular" />
                  </label>
                ))}
                <label className="flex flex-col gap-1">
                  <span className="rotulo">Operador</span>
                  <input name="operador" defaultValue={c.fechamento?.dados.operador ?? ''} className="campo" />
                </label>
              </div>
              <input name="observacao" defaultValue={c.fechamento?.dados.observacao ?? ''} placeholder="Observação (opcional)" className="campo w-full" />
              {c.resumo ? (
                <p className="text-xs text-zinc-500 tabular">
                  Esperado na gaveta: {fmtMoeda(c.resumo.esperado)} · diferença {fmtMoeda(c.resumo.diferenca)}
                </p>
              ) : null}
              <button type="submit" className="botao">
                {c.fechamento ? 'Atualizar fechamento' : 'Fechar o caixa'}
              </button>
            </FormAcao>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="cartao space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Cofre (numerário)</h2>
            <span className="text-lg font-semibold tabular">{fmtMoeda(p.cofre.saldo)}</span>
          </div>
          <p className="text-xs text-zinc-500">Saldo em {fmtDataCurta(p.dia)}: sangrias − suprimentos − recolhimentos + entregas do carro-forte. Inclui o dinheiro da CAIXA (não é receita da loja).</p>
          <FormAcao acao="/api/gestao/caixas" limpar className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="acao" value="carro-forte" />
            <input type="hidden" name="loja" value={p.loja} />
            <input type="hidden" name="dia" value={p.dia} />
            <label className="flex flex-col gap-1">
              <span className="rotulo">Carro-forte</span>
              <select name="tipo" className="campo">
                <option value="recolhimento">Recolhimento (sai do cofre)</option>
                <option value="entrega">Entrega (chega ao cofre)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="rotulo">Valor</span>
              <input name="valor" required inputMode="decimal" className="campo w-28 tabular" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="rotulo">Guia / lacre</span>
              <input name="guia" className="campo w-28" />
            </label>
            <button type="submit" className="botao">
              Registrar
            </button>
          </FormAcao>
          <ul className="max-h-64 divide-y divide-zinc-100 overflow-y-auto text-sm dark:divide-zinc-800">
            {p.cofre.movimentos.slice(0, 40).map((m, i) => (
              <li key={i} className="flex justify-between gap-2 py-1.5 tabular">
                <span className="text-zinc-500">{fmtDataCurta(m.dia)}</span>
                <span className="flex-1">{m.descricao}</span>
                <span className={m.valor < 0 ? 'text-red-600 dark:text-red-400' : ''}>{fmtMoeda(m.valor)}</span>
              </li>
            ))}
            {!p.cofre.movimentos.length ? <li className="py-2 text-zinc-500">Sem movimentos nos últimos 30 dias.</li> : null}
          </ul>
          {p.carroForte.length ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-500">Desfazer um registro do carro-forte</summary>
              <ul className="mt-2 space-y-1">
                {p.carroForte.slice(0, 10).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span>
                      {fmtDataCurta(c.dia!)} {c.dados.tipo} {fmtMoeda(c.dados.valor)}
                    </span>
                    <FormAcao acao="/api/gestao/caixas" confirmar="Remover este registro do carro-forte?">
                      <input type="hidden" name="acao" value="remover-carro-forte" />
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="loja" value={p.loja} />
                      <input type="hidden" name="dia" value={p.dia} />
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

        <div className="cartao space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Quebras de caixa (30 dias)</h2>
            <span className={`font-semibold tabular ${cor(p.totalQuebras30)}`}>{fmtMoeda(p.totalQuebras30)}</span>
          </div>
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {p.quebras30.slice(0, 15).map(([dia, d]) => (
              <li key={dia} className="flex justify-between py-1.5 tabular">
                <a className="link" href={`/gestao/caixas?loja=${p.loja}&dia=${dia}`}>
                  {fmtDataCurta(dia)}
                </a>
                <span className={cor(d)}>{fmtMoeda(d)}</span>
              </li>
            ))}
            {!p.quebras30.length ? <li className="py-2 text-zinc-500">Nenhum fechamento ainda.</li> : null}
          </ul>
          <p className="text-xs text-zinc-500">
            Faltas e sobras entram no DRE do mês. Fechar o dia de ontem:{' '}
            <a className="link" href={`/gestao/caixas?loja=${p.loja}&dia=${somarDias(p.hoje, -1)}`}>
              {fmtDataCurta(somarDias(p.hoje, -1))}
            </a>
          </p>
        </div>
      </section>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Caixas desta lotérica</h2>
        <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {p.caixas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {c.dados.nome} <span className="text-zinc-500">· {c.dados.tipo === 'tfl' ? 'TFL' : 'extra'}</span>
                {!c.dados.ativo ? <span className="ml-1 text-xs text-zinc-400">(desativado)</span> : null}
              </span>
              {c.dados.ativo ? (
                <FormAcao acao="/api/gestao/caixas" confirmar={`Tirar ${c.dados.nome}? (com fechamentos guardados, ele só é desativado)`}>
                  <input type="hidden" name="acao" value="remover-caixa" />
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="loja" value={p.loja} />
                  <input type="hidden" name="dia" value={p.dia} />
                  <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                    remover
                  </button>
                </FormAcao>
              ) : null}
            </li>
          ))}
        </ul>
        <FormAcao acao="/api/gestao/caixas" limpar className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="acao" value="caixa" />
          <input type="hidden" name="loja" value={p.loja} />
          <input type="hidden" name="dia" value={p.dia} />
          <label className="flex flex-col gap-1">
            <span className="rotulo">Novo caixa</span>
            <input name="nome" required placeholder="TFL 2, Federal, Recargas…" className="campo w-56" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Tipo</span>
            <select name="tipo" className="campo">
              <option value="tfl">TFL</option>
              <option value="extra">Caixa extra (ex.: Federal)</option>
            </select>
          </label>
          <button type="submit" className="botao">
            Adicionar
          </button>
        </FormAcao>
      </section>
    </div>
  );
}
