import Link from 'next/link';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { Grafico } from '@/components/Grafico';
import { Kpi } from '@/components/Kpi';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtDataCurta, fmtInt, fmtMoeda, fmtPct, NOME_MODALIDADE } from '@/lib/formato';
import { filasDoConcurso, fonteMercado, lerFiltro } from '@/lib/mercado';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Filas MKP' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Filas({ searchParams }: Props) {
  const sp = await searchParams;
  const fonte = fonteDeDados();
  const m = fonteMercado(fonte);
  const aVenda = await m.concursosAVenda(m.agora());
  const virada = await m.megaDaVirada(m.agora());
  const opcoes = [...aVenda, ...(virada ? [virada] : [])];
  const chave = sp.concurso && opcoes.some((c) => c.chave === sp.concurso) ? sp.concurso : opcoes[0]?.chave;
  const filtro = lerFiltro({ uf: sp.uf ?? null, cidade: sp.cidade ?? null });
  const d = chave ? await filasDoConcurso(fonte, chave, { filtro }) : null;
  const params = new URLSearchParams({ ...(chave ? { concurso: chave } : {}), ...(sp.uf ? { uf: sp.uf } : {}), ...(sp.cidade ? { cidade: sp.cidade } : {}) });
  if (!d) return <p className="cartao text-sm text-zinc-500">Nenhum concurso à venda.</p>;
  const r = d.resumo;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Filas MKP</h1>
          <p className="text-sm text-zinc-500">
            {NOME_MODALIDADE[d.concurso.modalidade]} {d.concurso.concurso}{d.concurso.especial ? ' (especial)' : ''} · {sp.cidade ? `${sp.cidade}/` : ''}{sp.uf || 'Brasil'}
          </p>
        </div>
        <div className="flex gap-2">
          <a className="botao" href={`/api/mercado/filas?${params}&formato=csv`}>CSV</a>
          <a className="botao" href={`/api/mercado/filas?${params}&formato=xlsx`}>Excel</a>
        </div>
      </div>
      <section className="cartao">
        <FormFiltros>
          <Seletor nome="concurso" rotulo="Loteria" valor={chave ?? ''} opcoes={opcoes.map((c) => [c.chave, `${NOME_MODALIDADE[c.modalidade]} ${c.concurso}${c.especial ? ' (Virada)' : ''}`] as [string, string])} />
          <Seletor nome="uf" rotulo="UF" valor={sp.uf ?? ''} opcoes={[['', 'Brasil'], ...d.ufs.map((u) => [u, u] as [string, string])]} />
          <Seletor nome="cidade" rotulo="Cidade" valor={sp.cidade ?? ''} opcoes={[['', 'Todas'], ...(d.cidades[sp.uf ?? ''] ?? []).map((c) => [c, c] as [string, string])]} />
        </FormFiltros>
      </section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi rotulo="Bolões" valor={fmtInt(r.boloes)} detalhe={`${fmtInt(r.esgotados)} esgotados`} />
        <Kpi rotulo="Lotéricas" valor={fmtInt(r.lotericas)} />
        <Kpi rotulo="Páginas / filas" valor={`${fmtInt(r.paginas)} / ${fmtInt(r.filas)}`} />
        <Kpi rotulo="Vendido" valor={fmtMoeda(r.valorVendido)} />
        <Kpi rotulo="À venda" valor={fmtMoeda(r.valorAVenda)} detalhe={r.maiorBolao ? `maior: ${fmtMoeda(r.maiorBolao.valorTotal)}` : undefined} />
      </div>
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Por fila</h2>
        <div className="overflow-x-auto">
          <table className="tabela tabular min-w-[980px]">
            <thead>
              <tr><th>Fila</th><th className="text-right">Bolões</th><th className="text-right">À venda</th><th className="text-right">R$ à venda</th><th className="text-right">% vendido</th><th>Páginas</th><th className="text-right">Cota média</th><th className="text-right">Bolão médio</th><th>Mais colocado</th><th>Mais vende</th></tr>
            </thead>
            <tbody>
              {r.porFila.map((f) => (
                <tr key={f.fila}>
                  <td>{f.fila}ª</td><td className="text-right">{fmtInt(f.boloes)}</td><td className="text-right">{fmtInt(f.aVenda)}</td><td className="text-right">{fmtMoeda(f.valorAVenda)}</td>
                  <td className="text-right">{fmtPct(f.pctVendido)}</td><td>{f.paginaDe ? `${f.paginaDe} a ${f.paginaAte}` : '—'}</td>
                  <td className="text-right">{fmtMoeda(f.cotaMedia)}</td><td className="text-right">{fmtMoeda(f.bolaoMedio)}</td>
                  <td className="font-mono text-xs">{f.formatoMaisColocado}</td>
                  <td className="font-mono text-xs">{f.formatoQueMaisVende ? `${f.formatoQueMaisVende.formato} (${fmtPct(f.formatoQueMaisVende.pctVendido)})` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Vendido por faixa de preço da cota</h2>
          <table className="tabela tabular">
            <thead><tr><th>Cota</th><th className="text-right">Bolões</th><th className="text-right">% vendido</th><th className="text-right">Sobra relativa</th></tr></thead>
            <tbody>
              {r.porFaixaDePreco.map((f) => (
                <tr key={f.faixa}><td>{f.faixa}</td><td className="text-right">{fmtInt(f.boloes)}</td><td className="text-right">{fmtPct(f.pctVendido)}</td><td className="text-right">{f.sobraRelativa === null ? '—' : `${f.sobraRelativa.toLocaleString('pt-BR')}x`}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-zinc-500">Sobra relativa: quanto sobra em proporção à faixa mais barata (2x = sobra o dobro).</p>
        </section>
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Bolões novos por dia</h2>
          <Grafico tipo="barras" rotulos={r.novosPorDia.map((x) => fmtDataCurta(x.dia))} series={[{ nome: 'novos', valores: r.novosPorDia.map((x) => x.novos), cor: 'text-emerald-500' }]} />
        </section>
      </div>
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Maiores bolões</h2>
        <div className="overflow-x-auto">
          <table className="tabela tabular min-w-[760px]">
            <thead><tr><th>#</th><th>Lotérica</th><th>Cidade</th><th>Formato</th><th className="text-right">Fila</th><th className="text-right">Bolão</th><th className="text-right">Cota</th><th className="text-right">Vendido</th></tr></thead>
            <tbody>
              {r.maiores.map((b, i) => (
                <tr key={b.id}>
                  <td>{i + 1}</td>
                  <td><Link className="link" href={`/estatisticas/lotericas/${b.loterica.codigoCaixa}`}>{b.loterica.nome}</Link></td>
                  <td>{b.loterica.cidade}/{b.loterica.uf}</td><td className="font-mono text-xs">{b.formato}</td><td className="text-right">{b.fila}</td>
                  <td className="text-right">{fmtMoeda(b.valorTotal)}</td><td className="text-right">{fmtMoeda(b.valorCotaBase)}</td><td className="text-right">{fmtPct(b.pctVendido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-zinc-500">Estimativas a partir de leituras da vitrine pública. Valores sem tarifa.</p>
    </div>
  );
}
