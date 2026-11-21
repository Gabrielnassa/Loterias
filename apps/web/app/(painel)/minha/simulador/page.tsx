import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { Grafico } from '@/components/Grafico';
import { Indisponivel } from '@/components/Indisponivel';
import { horaDoAtraso, simuladorDePosicao } from '@/lib/abertura-ferramentas';
import { fonteDeDados } from '@/lib/fonte-dados';
import { DIAS_SEMANA, fmtPct, NOME_ESCOPO, NOME_MODALIDADE } from '@/lib/formato';
import { MinhaIndisponivel } from '@/lib/minha';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Simulador de posição' };

export default async function Simulador({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  let s;
  try {
    s = await simuladorDePosicao(fonteDeDados(), { loja: sp.loja ?? null, modalidade: sp.modalidade ?? null, diaSemana: sp.dia ? Number(sp.dia) : null, hora: sp.hora ?? null });
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return <Indisponivel mensagem={e.message} />;
    throw e;
  }
  const limite = (e: 'cidade' | 'uf' | 'brasil') => {
    const l = s.limitePagina1[e];
    return l.metade === null ? 'nem chegando em T0' : `até ${horaDoAtraso(l.metade, s.diaSemana)}${l.quase !== null ? ` (80% de chance até ${horaDoAtraso(l.quase, s.diaSemana)})` : ''}`;
  };
  return (
    <div className="space-y-6">
      <section className="cartao space-y-3">
        <h2 className="text-lg font-semibold">Se eu entrar às {s.hora}, em que página caio?</h2>
        <FormFiltros>
          <input type="hidden" name="loja" value={s.loterica.codigoCaixa} />
          <label className="flex flex-col gap-1"><span className="rotulo">Hora do 1º bolão</span><input name="hora" type="time" step={1} defaultValue={s.hora} className="campo tabular" /></label>
          <Seletor nome="dia" rotulo="Dia da semana" valor={String(s.diaSemana)} opcoes={DIAS_SEMANA.map((d, i) => [String(i + 1), d] as [string, string])} />
          <Seletor nome="modalidade" rotulo="Loteria" valor={s.modalidade} opcoes={[['todas', 'Todas'], ...(['lotofacil', 'quina', 'mega-sena'] as const).map((m) => [m, NOME_MODALIDADE[m]!] as [string, string])]} />
        </FormFiltros>
        <div className="grid gap-3 md:grid-cols-3">
          {s.porEscopo.map((e) => (
            <div key={e.escopo} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="rotulo">{e.escopo === 'cidade' ? s.loterica.cidade : e.escopo === 'uf' ? s.loterica.uf : 'Brasil'} · {NOME_ESCOPO[e.escopo]}</div>
              <div className="tabular mt-1 text-2xl font-semibold">{e.paginaMediana === null ? '—' : `pág. ${e.paginaMediana}`}</div>
              <div className="text-sm text-zinc-500">
                {e.posicaoMediana === null ? 'sem aberturas no período' : `~${e.posicaoMediana}º (entre ${e.posicaoP10}º e ${e.posicaoP90}º) · ${fmtPct(e.chancePagina1)} de chance na pág. 1`}
              </div>
              <div className="mt-1 text-xs text-zinc-500">Pág. 1: {limite(e.escopo)}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          Base: {s.porEscopo[0]?.aberturas ?? 0} aberturas de {DIAS_SEMANA[s.diaSemana - 1]} nas últimas 8 semanas. Posição = 1 + lotéricas do escopo cujo 1º bolão chegou antes (a 1ª fila é a ordem de
          chegada do 1º bolão de cada lotérica).
        </p>
      </section>
      <section className="cartao">
        <Grafico
          titulo="Posição mediana pela hora de entrada (segundos depois de T0)"
          rotulos={s.curva.map((c) => (c.atrasoS < 60 ? `+${c.atrasoS}s` : `+${Math.round(c.atrasoS / 60)}min`))}
          series={[
            { nome: s.loterica.uf, valores: s.curva.map((c) => c.uf ?? 0), cor: 'text-sky-500' },
            { nome: s.loterica.cidade, valores: s.curva.map((c) => c.cidade ?? 0), cor: 'text-emerald-500' },
          ]}
        />
      </section>
    </div>
  );
}
