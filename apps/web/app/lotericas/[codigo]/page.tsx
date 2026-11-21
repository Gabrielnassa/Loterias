import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { GradeAberturas, LegendaFaixas } from '@/components/GradeAberturas';
import { Kpi } from '@/components/Kpi';
import { fonteDeDados } from '@/lib/fonte-dados';
import { DIAS_SEMANA, fmtAtraso, fmtPct, NOME_ESCOPO, NOME_MODALIDADE } from '@/lib/formato';
import { concorrentesSugeridos, fichaAberturas, lerEscopo, lerModalidade, lerSemanas } from '@/lib/servico';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ codigo: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props) {
  const l = await fonteDeDados().loterica((await params).codigo);
  return { title: l ? `${l.nome} — Aberturas` : 'Lotérica' };
}

function Variacao({ v, menorMelhor = false, sufixo = '', parcial = false }: { v: number | null; menorMelhor?: boolean; sufixo?: string; parcial?: boolean }) {
  if (parcial) return <span>semana em andamento</span>;
  if (v === null || Math.abs(v) < 0.05) return <span>estável</span>;
  const bom = menorMelhor ? v < 0 : v > 0;
  return (
    <span className={bom ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
      {v > 0 ? '+' : ''}
      {v.toFixed(1).replace('.', ',')}
      {sufixo} vs. média das 4 anteriores
    </span>
  );
}

export default async function FichaLoterica({ params, searchParams }: Props) {
  const { codigo } = await params;
  const sp = await searchParams;
  const fonte = fonteDeDados();
  const escopo = lerEscopo(sp.escopo);
  const modalidade = lerModalidade(sp.modalidade);
  const semanas = lerSemanas(sp.semanas);
  const f = await fichaAberturas(fonte, codigo, { escopo, modalidade, semanas });
  if (!f) notFound();
  const concorrentes = await concorrentesSugeridos(fonte, codigo, 5);
  const { loterica: l, resumo, tendencia, chanceAmanha } = f;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rotulo">Lotérica {l.codigoCaixa}</div>
          <h1 className="text-2xl font-semibold">{l.nome}</h1>
          <p className="text-sm text-zinc-500">
            {l.bairro ? `${l.bairro} · ` : ''}
            {l.cidade}/{l.uf}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link className="botao" href={`/comparar?codigos=${[l.codigoCaixa, ...concorrentes].join(',')}`}>
            Comparar com concorrentes
          </Link>
          <Link className="botao" href={`/ao-vivo?uf=${l.uf}&destaque=${l.codigoCaixa}`}>
            Ao vivo na abertura
          </Link>
          <a className="botao" href={`/api/lotericas/${l.codigoCaixa}/aberturas?semanas=${semanas}&modalidade=${modalidade}&escopo=${escopo}`}>
            JSON (API)
          </a>
        </div>
      </div>

      <nav className="flex gap-4 border-b border-zinc-200 text-sm dark:border-zinc-800" aria-label="Abas da ficha">
        <span className="-mb-px border-b-2 border-sky-500 pb-2 font-medium">Aberturas</span>
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi rotulo={`Aberturas (${semanas} sem.)`} valor={`${resumo.participacoes}/${resumo.aberturasOcorridas}`} detalhe={`${fmtPct(resumo.taxa)} das aberturas`} />
        <Kpi
          rotulo="Nesta semana"
          valor={tendencia.participacoes.atual}
          detalhe={
            <>
              média das 4 anteriores: {tendencia.participacoes.mediaAnteriores?.toFixed(1).replace('.', ',') ?? '—'}
              {tendencia.participacoes.semanaParcial ? ' (semana em andamento)' : null}
            </>
          }
        />
        <Kpi rotulo="Atraso mediano" valor={fmtAtraso(resumo.atrasoMedianoS)} detalhe={<Variacao v={tendencia.atrasoMedianoS.variacao} menorMelhor sufixo=" s" />} />
        <Kpi rotulo={`Melhor colocação (${NOME_ESCOPO[escopo]})`} valor={resumo.melhorPosicao ? `${resumo.melhorPosicao}º` : '—'} detalhe={resumo.posicaoMediana !== null ? `mediana ${Math.round(resumo.posicaoMediana)}º` : undefined} />
        <Kpi rotulo="Na página 1" valor={fmtPct(resumo.pctPagina1)} detalhe={`escopo: ${NOME_ESCOPO[escopo]}`} />
        <Kpi
          rotulo={`Chance de abrir amanhã (${DIAS_SEMANA[chanceAmanha.isodow - 1]})`}
          valor={fmtPct(chanceAmanha.chance)}
          detalhe={`abriu em ${chanceAmanha.semanasQueAbriu} de ${chanceAmanha.semanasComAbertura} semanas`}
        />
      </div>

      <section className="cartao space-y-4">
        <FormFiltros>
          <Seletor
            nome="modalidade"
            rotulo="Modalidade"
            valor={modalidade}
            opcoes={[['todas', 'Todas (consolidado do dia)'], ...(['lotofacil', 'quina', 'mega-sena'] as const).map((m) => [m, NOME_MODALIDADE[m]!] as [string, string])]}
          />
          <Seletor nome="escopo" rotulo="Colocação" valor={escopo} opcoes={[['cidade', 'Cidade'], ['uf', 'Estado (UF)'], ['brasil', 'Brasil']]} />
          <Seletor nome="semanas" rotulo="Semanas" valor={String(semanas)} opcoes={[['4', '4'], ['8', '8'], ['12', '12']]} />
        </FormFiltros>
        <GradeAberturas linhas={f.grade} mostrarModalidade={modalidade === 'todas'} />
        <LegendaFaixas />
      </section>
    </div>
  );
}
