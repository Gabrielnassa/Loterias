import Link from 'next/link';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtHora, fmtInt, fmtMoeda, NOME_MODALIDADE } from '@/lib/formato';
import { lerFiltro, panoramaLoterias } from '@/lib/mercado';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Estatísticas: Loterias' };

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

export default async function EstatisticasLoterias({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const d = await panoramaLoterias(fonteDeDados(), { filtro: lerFiltro({ uf: sp.uf ?? null }) });
  const q = sp.uf ? `uf=${sp.uf}&` : '';
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Estatísticas › Loterias</h1>
          <p className="text-sm text-zinc-500">Panorama {sp.uf ? `de ${sp.uf}` : 'nacional'} no último retrato ({fmtHora(d.em)}) · <Link className="link" href="/estatisticas/lotericas">Lotéricas</Link></p>
        </div>
        <div className="flex gap-2">
          <a className="botao" href={`/api/estatisticas/loterias?${q}formato=csv`}>CSV</a>
          <a className="botao" href={`/api/estatisticas/loterias?${q}formato=xlsx`}>Excel</a>
        </div>
      </div>
      <section className="cartao space-y-4">
        <FormFiltros>
          <Seletor nome="uf" rotulo="UF" valor={sp.uf ?? ''} opcoes={[['', 'Brasil'], ...UFS.map((u) => [u, u] as [string, string])]} />
        </FormFiltros>
        <div className="overflow-x-auto">
          <table className="tabela tabular min-w-[760px]">
            <thead><tr><th>Loteria</th><th className="text-right">Concurso</th><th className="text-right">Bolões à venda</th><th className="text-right">Cotas à venda</th><th className="text-right">Total inserido</th><th className="text-right">Ainda à venda</th><th className="text-right">Lotéricas</th><th className="text-right">Esgotados</th></tr></thead>
            <tbody>
              {d.linhas.map((l) => (
                <tr key={l.modalidade} className={l.modalidade === 'total' ? 'font-semibold' : ''}>
                  <td>{l.modalidade === 'total' ? 'Total' : <Link className="link" href={`/mercado/filas?concurso=${l.modalidade}-${l.concurso}${sp.uf ? `&uf=${sp.uf}` : ''}`}>{NOME_MODALIDADE[l.modalidade]}</Link>}</td>
                  <td className="text-right">{l.concurso ?? ''}</td><td className="text-right">{fmtInt(l.boloes)}</td><td className="text-right">{fmtInt(l.cotas)}</td>
                  <td className="text-right">{fmtMoeda(l.valorInserido)}</td><td className="text-right">{fmtMoeda(l.valorAVenda)}</td><td className="text-right">{fmtInt(l.lotericas)}</td><td className="text-right">{fmtInt(l.esgotados)}</td>
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
