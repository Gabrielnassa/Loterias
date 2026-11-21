import Link from 'next/link';
import { Abas } from '@/components/Abas';
import { AtualizarSozinho } from '@/components/AtualizarSozinho';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { Grafico } from '@/components/Grafico';
import { Kpi } from '@/components/Kpi';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtDataLonga, fmtHora, fmtInt, fmtMoeda, fmtPct, NOME_MODALIDADE } from '@/lib/formato';
import { abasDoConcurso, lerAba, lerFiltro, lerInstante, monitoramento } from '@/lib/mercado';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Monitoramento MKP' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const hm = (d: Date) => fmtHora(d).slice(0, 5);
const ABAS: [string, string][] = [
  ['minuto', 'Minuto a minuto'],
  ['hora', 'Hora a hora'],
  ['paginas', 'Páginas'],
  ['valor', 'R$ minuto a minuto'],
];

function paraCampo(d: Date): string {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  return p.replace(' ', 'T');
}

export default async function Monitoramento({ searchParams }: Props) {
  const sp = await searchParams;
  const fonte = fonteDeDados();
  const filtro = lerFiltro({ uf: sp.uf ?? null });
  const em = lerInstante(sp.em);
  const m = await monitoramento(fonte, { em, filtro });
  const sel = m.cartoes.find((c) => c.concurso.chave === sp.concurso) ?? m.cartoes[0];
  const aba = lerAba(sp.aba);
  const det = sel ? await abasDoConcurso(fonte, sel.concurso.chave, { em: m.em, aba, filtro }) : null;
  const params: Record<string, string> = { ...(sp.uf ? { uf: sp.uf } : {}), ...(sp.em ? { em: sp.em } : {}), ...(sel ? { concurso: sel.concurso.chave } : {}) };
  const q = new URLSearchParams(params);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Monitoramento MKP</h1>
          <p className="text-sm text-zinc-500">
            {m.retrato ? `Retrato de ${fmtDataLonga(m.em)} às ${hm(m.em)}` : `Ao vivo · ${fmtDataLonga(m.em)} ${fmtHora(m.em)}`} · {sp.uf || 'Brasil'}
          </p>
        </div>
        {m.retrato ? <Link className="botao" href={`/mercado${sp.uf ? `?uf=${sp.uf}` : ''}`}>Voltar ao vivo</Link> : <AtualizarSozinho segundos={60} />}
      </div>

      <section className="cartao">
        <FormFiltros>
          <Seletor nome="uf" rotulo="UF" valor={sp.uf ?? ''} opcoes={[['', 'Brasil'], ...m.ufs.map((u) => [u, u] as [string, string])]} />
          <label className="flex flex-col gap-1">
            <span className="rotulo">Retrato (data e hora)</span>
            <input type="datetime-local" name="em" defaultValue={sp.em ?? paraCampo(m.em)} className="campo" />
          </label>
          {sel ? <input type="hidden" name="concurso" value={sel.concurso.chave} /> : null}
        </FormFiltros>
      </section>

      {m.cartoes.length === 0 ? <p className="cartao text-sm text-zinc-500">Nenhum concurso à venda neste instante.</p> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {m.cartoes.map(({ concurso: c, retrato: r, encerrado }) => (
          <Link
            key={c.chave}
            href={`/mercado?${new URLSearchParams({ ...params, concurso: c.chave })}`}
            className={`cartao block space-y-3 transition hover:border-sky-400 ${sel?.concurso.chave === c.chave ? 'ring-2 ring-sky-500/50' : ''}`}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{NOME_MODALIDADE[c.modalidade]} {c.concurso}</h2>
              <span className={`text-xs ${encerrado ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-zinc-500'}`}>
                {c.fechaEm ? `${encerrado ? 'encerrado às' : 'fecha'} ${encerrado ? '' : `${fmtDataLonga(c.fechaEm)} `}${hm(c.fechaEm)}` : ''}
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm tabular">
              <div><dt className="rotulo">Bolões</dt><dd className="text-lg font-semibold">{fmtInt(r.boloes)}</dd></div>
              <div><dt className="rotulo">Cotas</dt><dd className="text-lg font-semibold">{fmtInt(r.cotas)}</dd></div>
              <div><dt className="rotulo">Lotéricas</dt><dd className="text-lg font-semibold">{fmtInt(r.lotericas)}</dd></div>
              <div><dt className="rotulo">À venda</dt><dd>{fmtMoeda(r.valor)}</dd></div>
              <div><dt className="rotulo">Páginas</dt><dd>{fmtInt(r.paginas)}</dd></div>
              <div><dt className="rotulo">Ticket médio</dt><dd>{r.ticketMedio === null ? '—' : fmtMoeda(r.ticketMedio)}</dd></div>
              <div><dt className="rotulo">Δ 5 min</dt><dd>{fmtInt(r.delta5min.cotasVendidas)} vendidas · {r.delta5min.novos} novos</dd></div>
              <div><dt className="rotulo">Ritmo</dt><dd>{r.ritmoPorMinuto.toLocaleString('pt-BR')} cotas/min</dd></div>
              <div><dt className="rotulo">Esgotados</dt><dd>{fmtPct(r.pctEsgotado, 1)}</dd></div>
            </dl>
          </Link>
        ))}
      </div>

      {sel && det ? (
        <section className="cartao space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {NOME_MODALIDADE[sel.concurso.modalidade]} {sel.concurso.concurso}
            </h2>
            <div className="flex gap-2 text-sm">
              <Link className="link" href={`/mercado/filas?${new URLSearchParams({ concurso: sel.concurso.chave, ...(sp.uf ? { uf: sp.uf } : {}) })}`}>Filas deste concurso</Link>
              <a className="botao" href={`/api/mercado/serie?${q}&aba=${aba}&formato=csv`}>CSV</a>
              <a className="botao" href={`/api/mercado/serie?${q}&aba=${aba}&formato=xlsx`}>Excel</a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi rotulo="Inseridos" valor={fmtInt(sel.retrato.inseridos)} detalhe={fmtMoeda(sel.retrato.valorInserido)} />
            <Kpi rotulo="Vendido" valor={fmtMoeda(sel.retrato.valorVendido)} detalhe={`${fmtInt(sel.retrato.cotasVendidas)} cotas`} />
            <Kpi rotulo="Filas" valor={fmtInt(sel.retrato.filas)} detalhe={`${fmtInt(sel.retrato.paginas)} páginas`} />
            <Kpi rotulo="Bolão médio à venda" valor={sel.retrato.valorMedioBolao === null ? '—' : fmtMoeda(sel.retrato.valorMedioBolao)} />
          </div>
          <Abas abas={ABAS} ativa={aba} base="/mercado" params={params} />
          {aba === 'minuto' ? (
            <>
              <Grafico titulo="Cotas vendidas por minuto (última hora)" tipo="barras" rotulos={det.porMinuto.map((p) => hm(p.t))} series={[{ nome: 'cotas vendidas', valores: det.porMinuto.map((p) => p.cotasVendidas), cor: 'text-sky-500' }]} />
              <TabelaSerie pontos={[...det.porMinuto].reverse().slice(0, 30)} rotulo={(t) => hm(t)} />
            </>
          ) : aba === 'hora' ? (
            <>
              <Grafico titulo="Bolões à venda e novos por hora" tipo="barras" rotulos={det.porHora.map((p) => hm(new Date(p.t.getTime() - 3_600_000)))} series={[{ nome: 'novos', valores: det.porHora.map((p) => p.novos), cor: 'text-emerald-500' }, { nome: 'esgotados', valores: det.porHora.map((p) => p.esgotados), cor: 'text-rose-500' }]} />
              <TabelaSerie pontos={[...det.porHora].reverse()} rotulo={(t) => `${fmtDataLonga(new Date(t.getTime() - 3_600_000)).slice(0, 10)} ${hm(new Date(t.getTime() - 3_600_000))}`} />
            </>
          ) : aba === 'paginas' ? (
            <>
              <Grafico titulo="Páginas da vitrine (hora a hora)" rotulos={det.porHora.map((p) => hm(p.t))} series={[{ nome: 'páginas', valores: det.porHora.map((p) => p.paginas), cor: 'text-violet-500' }]} />
              <div className="overflow-x-auto">
                <table className="tabela tabular min-w-[640px]">
                  <thead><tr><th>Fila</th><th className="text-right">À venda</th><th>Páginas</th><th className="text-right">% vendido</th><th className="text-right">Cota média</th><th>Formato mais colocado</th></tr></thead>
                  <tbody>
                    {det.filas.porFila.slice(0, 15).map((f) => (
                      <tr key={f.fila}><td>{f.fila}ª</td><td className="text-right">{fmtInt(f.aVenda)}</td><td>{f.paginaDe ? `${f.paginaDe} a ${f.paginaAte}` : '—'}</td><td className="text-right">{fmtPct(f.pctVendido)}</td><td className="text-right">{fmtMoeda(f.cotaMedia)}</td><td className="font-mono text-xs">{f.formatoMaisColocado}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <Grafico titulo="R$ à venda e R$ vendido por minuto (última hora)" rotulos={det.porMinuto.map((p) => hm(p.t))} series={[{ nome: 'R$ vendido no minuto', valores: det.porMinuto.map((p) => p.valorVendido), cor: 'text-emerald-500' }]} tipo="barras" />
              <Grafico rotulos={det.porMinuto.map((p) => hm(p.t))} series={[{ nome: 'R$ à venda', valores: det.porMinuto.map((p) => p.valor), cor: 'text-sky-500' }]} />
            </>
          )}
          <h3 className="pt-2 font-semibold">Maiores bolões à venda</h3>
          <div className="overflow-x-auto">
            <table className="tabela tabular min-w-[720px]">
              <thead><tr><th>Lotérica</th><th>Cidade</th><th>Formato</th><th className="text-right">Fila</th><th className="text-right">Bolão</th><th className="text-right">Cota</th><th className="text-right">Restam</th><th>Entrou</th></tr></thead>
              <tbody>
                {sel.retrato.maiores.map((b) => (
                  <tr key={b.id}>
                    <td><Link className="link" href={`/estatisticas/lotericas/${b.loterica.codigoCaixa}`}>{b.loterica.nome}</Link></td>
                    <td>{b.loterica.cidade}/{b.loterica.uf}</td>
                    <td className="font-mono text-xs">{b.formato}</td>
                    <td className="text-right">{b.fila}</td>
                    <td className="text-right">{fmtMoeda(b.valorTotal)}</td>
                    <td className="text-right">{fmtMoeda(b.valorCotaBase)}</td>
                    <td className="text-right">{b.disponiveis}/{b.cotasTotal}</td>
                    <td>{fmtDataLonga(b.entrouEm).slice(0, 10)} {hm(b.entrouEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <p className="text-xs text-zinc-500">
        Estimativas a partir de leituras periódicas da vitrine pública; vendas = quedas de cotas disponíveis entre leituras. Valores sem tarifa.
      </p>
    </div>
  );
}

function TabelaSerie({ pontos, rotulo }: { pontos: { t: Date; boloes: number; cotas: number; valor: number; paginas: number; novos: number; cotasVendidas: number; valorVendido: number; esgotados: number }[]; rotulo: (t: Date) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabela tabular min-w-[720px]">
        <thead>
          <tr><th>Até</th><th className="text-right">Bolões</th><th className="text-right">Cotas</th><th className="text-right">À venda</th><th className="text-right">Páginas</th><th className="text-right">Novos</th><th className="text-right">Cotas vendidas</th><th className="text-right">R$ vendido</th><th className="text-right">Esgotados</th></tr>
        </thead>
        <tbody>
          {pontos.map((p) => (
            <tr key={p.t.getTime()}>
              <td>{rotulo(p.t)}</td><td className="text-right">{fmtInt(p.boloes)}</td><td className="text-right">{fmtInt(p.cotas)}</td><td className="text-right">{fmtMoeda(p.valor)}</td><td className="text-right">{p.paginas}</td>
              <td className="text-right">{p.novos}</td><td className="text-right">{fmtInt(p.cotasVendidas)}</td><td className="text-right">{fmtMoeda(p.valorVendido)}</td><td className="text-right">{p.esgotados}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
