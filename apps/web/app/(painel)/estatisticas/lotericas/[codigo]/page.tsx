import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { Grafico, MapaDeCalor } from '@/components/Grafico';
import { Kpi } from '@/components/Kpi';
import { fonteDeDados } from '@/lib/fonte-dados';
import { DIAS_SEMANA, fmtDataCurta, fmtHora, fmtInt, fmtMoeda, fmtPct, NOME_MODALIDADE } from '@/lib/formato';
import { fichaDaLoterica } from '@/lib/mercado';
import { normalizarCodigoLoterica, type MetricasLoterica } from '@radar/core';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ficha da lotérica' };

const minutos = (m: number | null) => (m === null ? '—' : m < 120 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1).replace('.', ',')} h`);

export default async function Ficha({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { codigo: bruto } = await params;
  const sp = await searchParams;
  const codigo = normalizarCodigoLoterica(decodeURIComponent(bruto)) ?? bruto;
  const dias = Number(sp.dias) === 7 || Number(sp.dias) === 90 ? Number(sp.dias) : 30;
  const f = await fichaDaLoterica(fonteDeDados(), codigo, { dias });
  if (!f) notFound();
  const linhaComparacao = (rotulo: string, k: keyof MetricasLoterica, fmt: (v: number | null) => string) => (
    <tr>
      <td>{rotulo}</td><td className="text-right font-semibold">{fmt(f.comparacao.loterica[k])}</td><td className="text-right">{fmt(f.comparacao.cidade[k])}</td><td className="text-right">{fmt(f.comparacao.uf[k])}</td>
    </tr>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{f.loterica.nome}</h1>
          <p className="text-sm text-zinc-500">
            {f.loterica.bairro ? `${f.loterica.bairro}, ` : ''}{f.loterica.cidade}/{f.loterica.uf} · código {f.loterica.codigoCaixa} · {fmtDataCurta(f.de)} a {fmtDataCurta(f.ate)} ·{' '}
            <Link className="link" href={`/lotericas/${f.loterica.codigoCaixa}`}>Raio-X de abertura</Link>
          </p>
        </div>
        <FormFiltros>
          <Seletor nome="dias" rotulo="Período" valor={String(dias)} opcoes={[['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias']]} />
        </FormFiltros>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi rotulo="Franquia usada hoje" valor={fmtMoeda(f.franquiaHoje)} detalhe="bolões inseridos 05:00-23:00" />
        <Kpi rotulo="Bolões" valor={fmtInt(f.boloes)} detalhe={fmtMoeda(f.valorInserido)} />
        <Kpi rotulo="Vendido" valor={fmtPct(f.pctVendido)} detalhe={`${fmtInt(f.cotasVendidas)} cotas`} />
        <Kpi rotulo="Lucro estimado" valor={fmtMoeda(f.resultado.lucro)} detalhe={`tarifa ${fmtMoeda(f.resultado.tarifa)} · sobra ${fmtMoeda(f.resultado.sobra)}`} />
        <Kpi rotulo="À venda agora" valor={fmtInt(f.emAndamento.boloes)} detalhe={fmtMoeda(f.emAndamento.valorAVenda)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Por loteria</h2>
          <table className="tabela tabular">
            <thead><tr><th>Loteria</th><th className="text-right">Bolões</th><th className="text-right">R$ inserido</th><th className="text-right">% vendido</th><th className="text-right">Lucro</th></tr></thead>
            <tbody>{f.porLoteria.map((l) => <tr key={l.modalidade}><td>{NOME_MODALIDADE[l.modalidade]}</td><td className="text-right">{fmtInt(l.boloes)}</td><td className="text-right">{fmtMoeda(l.valorInserido)}</td><td className="text-right">{fmtPct(l.pctVendido)}</td><td className="text-right">{fmtMoeda(l.lucro)}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Evolução mensal</h2>
          <Grafico tipo="barras" rotulos={f.evolucaoMensal.map((m) => m.mes)} series={[{ nome: 'R$ inserido', valores: f.evolucaoMensal.map((m) => m.valorInserido), cor: 'text-sky-500' }, { nome: 'lucro', valores: f.evolucaoMensal.map((m) => Math.max(0, m.lucro)), cor: 'text-emerald-500' }]} altura={160} />
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Perfil dos bolões</h2>
          <p className="text-sm">Cota média {f.perfil.cotaMedia === null ? '—' : fmtMoeda(f.perfil.cotaMedia)} · {f.perfil.cotasMedias ?? '—'} cotas por bolão · bolão médio {f.perfil.bolaoMedio === null ? '—' : fmtMoeda(f.perfil.bolaoMedio)}</p>
          <table className="tabela tabular">
            <thead><tr><th>Formato</th><th className="text-right">Bolões</th><th className="text-right">% vendido</th></tr></thead>
            <tbody>{f.perfil.formatos.map((x) => <tr key={x.formato}><td className="font-mono text-xs">{x.formato}</td><td className="text-right">{x.boloes}</td><td className="text-right">{fmtPct(x.pctVendido)}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Velocidade de venda</h2>
          <p className="text-sm">
            {fmtPct(f.velocidade.pctEsgotados)} dos bolões esgotam · tempo mediano para esgotar {minutos(f.velocidade.minutosParaEsgotar)} · monta mais{' '}
            {f.velocidade.diaQueMaisMonta ? DIAS_SEMANA[f.velocidade.diaQueMaisMonta - 1] : '—'} às {f.velocidade.horaQueMaisMonta ?? '—'}h
          </p>
          <MapaDeCalor matriz={f.velocidade.mapaDeCalor} dias={DIAS_SEMANA} />
        </section>
      </div>
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Comparação</h2>
        <table className="tabela tabular">
          <thead><tr><th /><th className="text-right">Esta lotérica</th><th className="text-right">Mediana {f.loterica.cidade} ({f.comparacao.lotericasNaCidade})</th><th className="text-right">Mediana {f.loterica.uf} ({f.comparacao.lotericasNaUf})</th></tr></thead>
          <tbody>
            {linhaComparacao('Bolões por semana', 'boloesPorSemana', (v) => (v === null ? '—' : v.toLocaleString('pt-BR')))}
            {linhaComparacao('% vendido', 'pctVendido', (v) => fmtPct(v))}
            {linhaComparacao('Cota média', 'cotaMedia', (v) => (v === null ? '—' : fmtMoeda(v)))}
            {linhaComparacao('Tempo para esgotar', 'minutosParaEsgotar', minutos)}
            {linhaComparacao('Lucro por bolão', 'lucroPorBolao', (v) => (v === null ? '—' : fmtMoeda(v)))}
          </tbody>
        </table>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Maiores bolões</h2>
          <table className="tabela tabular">
            <thead><tr><th>Loteria</th><th>Formato</th><th className="text-right">Bolão</th><th className="text-right">Vendido</th><th>Entrou</th></tr></thead>
            <tbody>{f.maiores.map((b) => <tr key={b.id}><td>{NOME_MODALIDADE[b.modalidade]} {b.concurso}</td><td className="font-mono text-xs">{b.formato}</td><td className="text-right">{fmtMoeda(b.valorTotal)}</td><td className="text-right">{fmtPct(b.pctVendido)}</td><td>{fmtDataCurta(b.entrouEm)} {fmtHora(b.entrouEm).slice(0, 5)}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Bolões à venda agora</h2>
          {f.aVendaAgora.length ? (
            <table className="tabela tabular">
              <thead><tr><th>Loteria</th><th>Formato</th><th className="text-right">Cota</th><th className="text-right">Restam</th></tr></thead>
              <tbody>{f.aVendaAgora.map((b) => <tr key={b.id}><td>{NOME_MODALIDADE[b.modalidade]} {b.concurso}</td><td className="font-mono text-xs">{b.formato}</td><td className="text-right">{fmtMoeda(b.valorCotaBase)}</td><td className="text-right">{b.disponiveis}/{b.cotasTotal}</td></tr>)}</tbody>
            </table>
          ) : <p className="text-sm text-zinc-500">Nenhum bolão à venda agora.</p>}
        </section>
      </div>
      <p className="text-xs text-zinc-500">
        Estimativas a partir de leituras da vitrine pública: vendas de terceiros contam como internet (o balcão não aparece), e o lucro só fecha nos concursos encerrados. Valores sem tarifa.
      </p>
    </div>
  );
}
