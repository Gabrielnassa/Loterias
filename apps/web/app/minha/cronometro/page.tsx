import { AoVivoPainel } from '@/components/AoVivoPainel';
import { Cronometro } from '@/components/Cronometro';
import { Indisponivel } from '@/components/Indisponivel';
import { cronometro, horaDoAtraso } from '@/lib/abertura-ferramentas';
import { fonteDeDados } from '@/lib/fonte-dados';
import { MinhaIndisponivel } from '@/lib/minha';
import { isodowDoDia, diaSP } from '@radar/core';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cronômetro de abertura' };

export default async function CronometroPagina({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  let c;
  try {
    c = await cronometro(fonteDeDados(), { loja: sp.loja ?? null });
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return <Indisponivel mensagem={e.message} />;
    throw e;
  }
  const dow = isodowDoDia(diaSP(c.proxima.t0));
  const lim = c.limitePagina1.uf.metade;
  return (
    <div className="space-y-6">
      <Cronometro t0={c.proxima.t0.toISOString()} alertaEm={c.proxima.alertaEm.toISOString()} limitePag1={lim === null ? null : horaDoAtraso(lim, dow)} />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Placar ao vivo · {c.loterica.uf}</h2>
        <AoVivoPainel uf={c.loterica.uf || 'SP'} destaque={c.loterica.codigoCaixa} inicial={JSON.parse(JSON.stringify(c.placar))} />
      </section>
    </div>
  );
}
