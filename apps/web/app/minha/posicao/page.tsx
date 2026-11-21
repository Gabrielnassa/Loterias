import Link from 'next/link';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { Indisponivel } from '@/components/Indisponivel';
import { Kpi } from '@/components/Kpi';
import { fonteDeDados } from '@/lib/fonte-dados';
import { DIAS_SEMANA, fmtAtraso, fmtDataCurta, fmtPct } from '@/lib/formato';
import { MinhaIndisponivel, posicaoMinha } from '@/lib/minha';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Posição na abertura' };

const COR = { rapido: 'faixa-pag1', medio: 'faixa-pag2-3', lento: 'faixa-pag4+' } as const;
const NOME = { rapido: 'rápido', medio: 'médio', lento: 'lento' } as const;
const fmtPag = (x: number | null) => (x === null ? '—' : x.toFixed(1).replace('.', ','));

export default async function PosicaoNaAbertura({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const dias = Number(sp.dias) || 30;
  let d;
  try {
    d = await posicaoMinha(fonteDeDados(), { dias });
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return <Indisponivel mensagem={e.message} />;
    throw e;
  }
  const r = d.resumo;
  const primeiroIsodow = d.calendario[0]?.isodow ?? 1;
  return (
    <div className="space-y-6">
      <section className="cartao">
        <FormFiltros>
          <Seletor nome="dias" rotulo="Período" valor={String(d.dias)} opcoes={[['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias']]} />
        </FormFiltros>
      </section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Aberturas em que entrou" valor={`${r.minhas}/${r.aberturas}`} />
        <Kpi rotulo="Na pág. 1 da UF" valor={fmtPct(r.pctPagina1Uf)} />
        <Kpi rotulo="Página média na UF" valor={fmtPag(r.paginaMediaUf)} detalhe={`outras lotéricas da UF: ${fmtPag(r.paginaMediaUfOutras)}`} />
        <Kpi rotulo="Abriu rápido?" valor={`${r.rapidas} rápidas`} detalhe={`${r.medias} médias · ${r.lentas} lentas`} />
      </div>
      <section className="cartao overflow-x-auto">
        <h2 className="mb-2 font-semibold">Por dia da semana</h2>
        <table className="tabela min-w-[640px]">
          <thead>
            <tr><th>Dia</th><th className="text-right">Aberturas</th><th className="text-right">Você entrou</th><th className="text-right">Pág. 1 (UF)</th><th className="text-right">Sua pág. média</th><th className="text-right">Outras (UF)</th><th className="text-right">Atraso mediano</th></tr>
          </thead>
          <tbody className="tabular">
            {d.porDiaSemana.map((x) => (
              <tr key={x.isodow}>
                <td>{DIAS_SEMANA[x.isodow - 1]}</td>
                <td className="text-right">{x.aberturas}</td>
                <td className="text-right">{x.minhas}</td>
                <td className="text-right">{fmtPct(x.pctPagina1Uf)}</td>
                <td className="text-right">{fmtPag(x.paginaMediaUf)}</td>
                <td className="text-right">{fmtPag(x.paginaMediaUfOutras)}</td>
                <td className="text-right">{fmtAtraso(x.atrasoMedianoS)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="cartao">
        <h2 className="mb-2 font-semibold">Abriu rápido? (rápido até 1 min, médio até 2 min, lento depois)</h2>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {DIAS_SEMANA.map((x) => (
            <div key={x} className="rotulo">{x}</div>
          ))}
          {Array.from({ length: primeiroIsodow - 1 }, (_, i) => <div key={`v${i}`} />)}
          {d.calendario.map((c) => (
            <div key={c.dia}>
              {c.participou ? (
                <Link href={`/aberturas/${c.aberturaId}`} className={`${COR[c.velocidade!]} tabular block rounded-md px-1 py-1.5`} title={`${c.hora} · ${fmtAtraso(c.atrasoS)} · ${c.posUf}º na UF`}>
                  <span className="block font-semibold">{fmtDataCurta(c.dia)}</span>
                  <span className="block">{NOME[c.velocidade!]} · p{c.paginaUf}</span>
                </Link>
              ) : (
                <span className={`block rounded-md px-1 py-1.5 ${c.houveAbertura ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800/60' : 'text-zinc-300 dark:text-zinc-700'}`}>
                  <span className="block">{fmtDataCurta(c.dia)}</span>
                  <span className="block">{c.houveAbertura ? 'não abriu' : '·'}</span>
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500">Só o 1º bolão da 1ª hora conta; quem entrou mais de 30 min depois de T0 não participou.</p>
      </section>
    </div>
  );
}
