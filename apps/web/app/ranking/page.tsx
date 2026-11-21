import Link from 'next/link';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtAtraso, fmtDataCurta, fmtPct, NOME_MODALIDADE } from '@/lib/formato';
import { lerCriterio, lerEscopo, lerModalidade, lerSemanas, locais, rankingPeriodo } from '@/lib/servico';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ranking da abertura' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const CRITERIOS: [string, string][] = [
  ['mais_aberturas', 'Quem abriu mais'],
  ['mais_rapida', 'Quem chega mais rápido'],
  ['mais_pagina1', 'Quem mais fica na pág. 1'],
];

export default async function Ranking({ searchParams }: Props) {
  const sp = await searchParams;
  const fonte = fonteDeDados();
  const minha = await fonte.minhaLoterica();
  const uf = sp.uf ?? minha?.uf ?? '';
  const cidade = sp.cidade ?? '';
  const escopo = lerEscopo(sp.escopo);
  const modalidade = lerModalidade(sp.modalidade);
  const semanas = lerSemanas(sp.semanas, 4, 13);
  const criterio = lerCriterio(sp.criterio);
  const { ufs, cidades } = await locais(fonte);
  const r = await rankingPeriodo(fonte, { ...(uf ? { uf } : {}), ...(cidade ? { cidade } : {}), escopo, modalidade, semanas, criterio });
  const params = new URLSearchParams({ uf, cidade, escopo, modalidade, semanas: String(semanas), criterio });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Ranking da abertura</h1>
          <p className="text-sm text-zinc-500">
            {uf || 'Brasil'}
            {cidade ? ` · ${cidade}` : ''} · {fmtDataCurta(r.de)} a {fmtDataCurta(r.ate)}
          </p>
        </div>
        <div className="flex gap-2">
          <a className="botao" href={`/api/ranking?${params}&formato=csv`}>
            CSV
          </a>
          <a className="botao" href={`/api/ranking?${params}&formato=xlsx`}>
            Excel
          </a>
        </div>
      </div>
      <section className="cartao space-y-4">
        <FormFiltros>
          <Seletor nome="criterio" rotulo="Critério" valor={criterio} opcoes={CRITERIOS} />
          <Seletor nome="uf" rotulo="UF" valor={uf} opcoes={[['', 'Brasil'], ...ufs.map((u) => [u, u] as [string, string])]} />
          <Seletor nome="cidade" rotulo="Cidade" valor={cidade} opcoes={[['', 'Todas'], ...(cidades[uf] ?? []).map((c) => [c, c] as [string, string])]} />
          <Seletor nome="semanas" rotulo="Período" valor={String(semanas)} opcoes={[['1', 'Esta semana'], ['4', '4 semanas'], ['8', '8 semanas'], ['12', '12 semanas']]} />
          <Seletor
            nome="modalidade"
            rotulo="Modalidade"
            valor={modalidade}
            opcoes={[['todas', 'Todas'], ...(['lotofacil', 'quina', 'mega-sena'] as const).map((m) => [m, NOME_MODALIDADE[m]!] as [string, string])]}
          />
          <Seletor nome="escopo" rotulo="Pág. 1 em" valor={escopo} opcoes={[['cidade', 'Cidade'], ['uf', 'Estado (UF)'], ['brasil', 'Brasil']]} />
        </FormFiltros>
        <div className="overflow-x-auto">
          <table className="tabela min-w-[760px]">
            <thead>
              <tr>
                <th>#</th>
                <th>Lotérica</th>
                <th>Cidade</th>
                <th className="text-right">Aberturas</th>
                <th className="text-right">Atraso mediano</th>
                <th className="text-right">Melhor</th>
                <th className="text-right">Mediana</th>
                <th className="text-right">Na pág. 1</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {r.linhas.map((l) => (
                <tr key={l.loterica.codigoCaixa} className={minha?.codigoCaixa === l.loterica.codigoCaixa ? 'bg-sky-50 dark:bg-sky-500/10' : ''}>
                  <td className="text-zinc-500">{l.posicao}</td>
                  <td>
                    <Link className="link" href={`/lotericas/${l.loterica.codigoCaixa}`}>
                      {l.loterica.nome}
                    </Link>
                  </td>
                  <td className="text-zinc-500">
                    {l.loterica.cidade}/{l.loterica.uf}
                  </td>
                  <td className="text-right">
                    {l.participacoes}/{l.aberturasOcorridas}
                  </td>
                  <td className="text-right">{fmtAtraso(l.atrasoMedianoS)}</td>
                  <td className="text-right">{l.melhorPosicao ? `${l.melhorPosicao}º` : '—'}</td>
                  <td className="text-right">{l.posicaoMediana !== null ? `${Math.round(l.posicaoMediana)}º` : '—'}</td>
                  <td className="text-right">{fmtPct(l.pctPagina1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.linhas.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Nenhuma abertura no período e local escolhidos.</p> : null}
        </div>
      </section>
    </div>
  );
}
