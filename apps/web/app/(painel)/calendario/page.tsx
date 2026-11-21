import Link from 'next/link';
import { fonteDeDados } from '@/lib/fonte-dados';
import { DIAS_SEMANA, fmtHora, NOME_MODALIDADE } from '@/lib/formato';
import { calendarioDoMes, diaSP, MODALIDADES } from '@radar/core';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Calendário de sorteios' };

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export default async function Calendario({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const hoje = diaSP(fonteDeDados().agora());
  const [anoH, mesH] = hoje.split('-').map(Number) as [number, number];
  const m = /^(\d{4})-(\d{2})$/.exec(sp.mes ?? '');
  const ano = m ? Number(m[1]) : anoH;
  const mes = m ? Number(m[2]) : mesH;
  const dias = calendarioDoMes(ano, mes);
  const vazios = dias[0]!.diaSemana - 1;
  const mesStr = (a: number, x: number) => `${x < 1 ? a - 1 : x > 12 ? a + 1 : a}-${String(((x + 11) % 12) + 1).padStart(2, '0')}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendário de sorteios</h1>
          <p className="text-sm text-zinc-500">Sorteios a partir das 21h (domingo, 11h); bolões do concurso seguinte abrem 45 min depois. Referência: confira feriados e especiais no calendário oficial.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="botao" href={`/calendario?mes=${mesStr(ano, mes - 1)}`}>‹</Link>
          <span className="w-36 text-center font-medium capitalize">{MESES[mes - 1]} {ano}</span>
          <Link className="botao" href={`/calendario?mes=${mesStr(ano, mes + 1)}`}>›</Link>
          <a className="botao" href={`/api/calendario?mes=${ano}-${String(mes).padStart(2, '0')}`}>JSON</a>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {DIAS_SEMANA.map((d) => <div key={d} className="rotulo px-1">{d}</div>)}
        {Array.from({ length: vazios }, (_, i) => <div key={`v${i}`} />)}
        {dias.map((d) => (
          <div key={d.dia} className={`cartao min-h-24 space-y-1 p-1.5 ${d.dia === hoje ? 'ring-2 ring-sky-500' : ''}`}>
            <div className="font-semibold">{Number(d.dia.slice(8))}</div>
            {d.sorteios.map((s) => (
              <div key={s.modalidade} className="flex items-center gap-1" title={`sorteio ${fmtHora(s.sorteioEm).slice(0, 5)} · bolões abrem ${fmtHora(s.aberturaEm).slice(0, 5)}`}>
                <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: MODALIDADES[s.modalidade].cor }} />
                <span className={s.especial ? 'font-semibold' : ''}>{s.especial ?? NOME_MODALIDADE[s.modalidade]}</span>
              </div>
            ))}
            {d.avisos.map((a) => <div key={a} className="text-amber-700 dark:text-amber-400">{a}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}
