import Link from 'next/link';
import { Contagem } from '@/components/Contagem';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { Grafico } from '@/components/Grafico';
import { Kpi } from '@/components/Kpi';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtDataCurta, fmtDataLonga, fmtHora, fmtInt, fmtMoeda, fmtPct } from '@/lib/formato';
import { lerFiltro, painelMegaDaVirada } from '@/lib/mercado';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mega da Virada' };

export default async function MegaDaVirada({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const p = await painelMegaDaVirada(fonteDeDados(), { filtro: lerFiltro({ uf: sp.uf ?? null }) });
  if (!p) return <p className="cartao text-sm text-zinc-500">Nenhum concurso especial da Mega-Sena à venda.</p>;
  const { concurso: c, retrato: r, filas } = p;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Mega da Virada · concurso {c.concurso}</h1>
          <p className="text-sm text-zinc-500">
            {c.sorteioEm ? `Sorteio ${fmtDataLonga(c.sorteioEm)} às ${fmtHora(c.sorteioEm).slice(0, 5)}` : ''}
            {c.fechaEm ? ` · bolões até ${fmtDataCurta(c.fechaEm)} ${fmtHora(c.fechaEm).slice(0, 5)}` : ''} · <Link className="link" href={`/mercado/filas?concurso=${c.chave}`}>todas as filas</Link>
          </p>
        </div>
        <div className="cartao text-right">
          <div className="rotulo">Falta para o sorteio</div>
          {c.sorteioEm ? <Contagem alvo={c.sorteioEm.toISOString()} alertaEm={24 * 3_600_000} /> : '—'}
        </div>
      </div>
      <section className="cartao">
        <FormFiltros>
          <Seletor nome="uf" rotulo="UF" valor={sp.uf ?? ''} opcoes={[['', 'Brasil'], ...p.ufs.map((u) => [u, u] as [string, string])]} />
        </FormFiltros>
      </section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi rotulo="Prêmio estimado" valor={c.premioEstimado ? fmtMoeda(c.premioEstimado).replace(',00', '') : '—'} />
        <Kpi rotulo="Bolões à venda" valor={fmtInt(r.boloes)} detalhe={`${fmtInt(r.inseridos)} inseridos`} />
        <Kpi rotulo="Lotéricas" valor={fmtInt(r.lotericas)} />
        <Kpi rotulo="Páginas / filas" valor={`${fmtInt(r.paginas)} / ${fmtInt(r.filas)}`} />
        <Kpi rotulo="À venda" valor={fmtMoeda(r.valor)} detalhe={`ticket ${r.ticketMedio === null ? '—' : fmtMoeda(r.ticketMedio)}`} />
        <Kpi rotulo="Vendido" valor={fmtMoeda(r.valorVendido)} detalhe={`${fmtPct(r.pctEsgotado)} esgotados`} />
      </div>
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Dia a dia</h2>
        <Grafico tipo="barras" rotulos={p.porDia.map((x) => fmtDataCurta(new Date(x.t.getTime() - 86_400_000)))} series={[{ nome: 'bolões novos', valores: p.porDia.map((x) => x.novos), cor: 'text-emerald-500' }]} />
        <Grafico rotulos={p.porDia.map((x) => fmtDataCurta(new Date(x.t.getTime() - 86_400_000)))} series={[{ nome: 'bolões à venda', valores: p.porDia.map((x) => x.boloes), cor: 'text-sky-500' }]} />
      </section>
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Filas</h2>
        <div className="overflow-x-auto">
          <table className="tabela tabular min-w-[760px]">
            <thead><tr><th>Fila</th><th className="text-right">Bolões</th><th className="text-right">À venda</th><th>Páginas</th><th className="text-right">% vendido</th><th className="text-right">Cota média</th><th>Mais colocado</th></tr></thead>
            <tbody>
              {filas.porFila.slice(0, 20).map((f) => (
                <tr key={f.fila}><td>{f.fila}ª</td><td className="text-right">{fmtInt(f.boloes)}</td><td className="text-right">{fmtInt(f.aVenda)}</td><td>{f.paginaDe ? `${f.paginaDe} a ${f.paginaAte}` : '—'}</td><td className="text-right">{fmtPct(f.pctVendido)}</td><td className="text-right">{fmtMoeda(f.cotaMedia)}</td><td className="font-mono text-xs">{f.formatoMaisColocado}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Maiores bolões</h2>
        <table className="tabela tabular">
          <thead><tr><th>Lotérica</th><th>Cidade</th><th>Formato</th><th className="text-right">Bolão</th><th className="text-right">Vendido</th></tr></thead>
          <tbody>{filas.maiores.map((b) => <tr key={b.id}><td><Link className="link" href={`/estatisticas/lotericas/${b.loterica.codigoCaixa}`}>{b.loterica.nome}</Link></td><td>{b.loterica.cidade}/{b.loterica.uf}</td><td className="font-mono text-xs">{b.formato}</td><td className="text-right">{fmtMoeda(b.valorTotal)}</td><td className="text-right">{fmtPct(b.pctVendido)}</td></tr>)}</tbody>
        </table>
      </section>
      <p className="text-xs text-zinc-500">Estimativas a partir de leituras da vitrine pública. Escala esperada: ~100 mil bolões e ~3.300 páginas.</p>
    </div>
  );
}
