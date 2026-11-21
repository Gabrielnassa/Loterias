import Link from 'next/link';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { fonteDeDados } from '@/lib/dados';
import { DIAS_SEMANA, fmtDataCurta, NOME_ESCOPO } from '@/lib/formato';
import { compararGrade, concorrentesSugeridos, lerEscopo, lerModalidade, lerSemanas } from '@/lib/servico';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Comparar' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Comparar({ searchParams }: Props) {
  const sp = await searchParams;
  const fonte = fonteDeDados();
  const minha = await fonte.minhaLoterica();
  let codigos = (sp.codigos ?? '').split(',').map((c) => c.trim()).filter(Boolean);
  if (!codigos.length && minha) codigos = [minha.codigoCaixa, ...(await concorrentesSugeridos(fonte, minha.codigoCaixa, 5))];
  const escopo = lerEscopo(sp.escopo);
  const modalidade = lerModalidade(sp.modalidade);
  const semanas = lerSemanas(sp.semanas, 4, 12);
  const c = await compararGrade(fonte, codigos, { escopo, modalidade, semanas });
  const semanasLista = c.grades[c.lotericas[0]?.codigoCaixa ?? '']?.map((g) => g.semana) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Comparar aberturas</h1>
        <p className="text-sm text-zinc-500">Você + até 5 concorrentes na mesma grade. ★ = quem chegou primeiro no dia.</p>
      </div>
      <section className="cartao">
        <FormFiltros>
          <label className="flex min-w-72 flex-1 flex-col gap-1">
            <span className="rotulo">Códigos (até 6, separados por vírgula)</span>
            <input name="codigos" defaultValue={c.lotericas.map((l) => l.codigoCaixa).join(',')} className="campo tabular" />
          </label>
          <Seletor nome="escopo" rotulo="Colocação" valor={escopo} opcoes={[['cidade', 'Cidade'], ['uf', 'Estado (UF)'], ['brasil', 'Brasil']]} />
          <Seletor nome="semanas" rotulo="Semanas" valor={String(semanas)} opcoes={[['2', '2'], ['4', '4'], ['8', '8']]} />
          <input type="hidden" name="modalidade" value={modalidade} />
        </FormFiltros>
      </section>

      <section className="cartao">
        <h2 className="mb-2 font-semibold">Vezes em que chegou primeiro</h2>
        <ul className="flex flex-wrap gap-3 text-sm">
          {c.lotericas.map((l, i) => (
            <li key={l.codigoCaixa} className="rounded-md border border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
              {i === 0 ? <span className="mr-1 text-xs text-sky-600">você</span> : null}
              <Link className="link" href={`/lotericas/${l.codigoCaixa}`}>
                {l.nome}
              </Link>{' '}
              <span className="tabular font-semibold">{c.vitorias[l.codigoCaixa]}</span>
            </li>
          ))}
        </ul>
      </section>

      {semanasLista.map((semana, si) => (
        <section key={semana} className="cartao overflow-x-auto">
          <h2 className="mb-2 text-sm font-semibold">Semana de {fmtDataCurta(semana)}</h2>
          <table className="tabela min-w-[820px]">
            <thead>
              <tr>
                <th>Lotérica</th>
                {DIAS_SEMANA.map((d) => (
                  <th key={d} className="text-center">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.lotericas.map((l, li) => (
                <tr key={l.codigoCaixa} className={li === 0 ? 'bg-sky-50/60 dark:bg-sky-500/5' : ''}>
                  <td className="max-w-56 truncate">
                    {l.nome}
                    <span className="ml-1 text-xs text-zinc-500">{l.cidade}</span>
                  </td>
                  {c.grades[l.codigoCaixa]![si]!.celulas.map((cel) => {
                    const primeiro = c.primeiroPorDia[cel.dia] === l.codigoCaixa;
                    return (
                      <td key={cel.dia} className="p-1">
                        {cel.participou ? (
                          <Link
                            href={`/aberturas/${cel.aberturaId}`}
                            className={`faixa-${cel.faixa} tabular block rounded-md px-1.5 py-1 text-center leading-tight ${primeiro ? 'ring-2 ring-sky-500' : ''}`}
                          >
                            <span className="block text-[13px] font-semibold">
                              {primeiro ? '★ ' : ''}
                              {cel.hora}
                            </span>
                            <span className="block text-[11px] opacity-80">
                              {cel.posicao}º · p{cel.pagina}
                            </span>
                          </Link>
                        ) : (
                          <span className="block py-2.5 text-center text-xs text-zinc-400">{cel.houveAbertura ? '—' : '·'}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="text-xs text-zinc-500">Colocação no escopo: {NOME_ESCOPO[escopo]}. Célula = melhor colocação do dia; ★ = menor atraso do dia entre as comparadas.</p>
    </div>
  );
}
