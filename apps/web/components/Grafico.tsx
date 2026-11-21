/**
 * Gráficos simples em SVG, renderizados no servidor (sem biblioteca no cliente). Linha ou barras,
 * uma ou duas séries, com o eixo de tempo em horário de São Paulo.
 */
export interface SerieGrafico {
  nome: string;
  valores: number[];
  /** Classe de cor do Tailwind para o traço (stroke) ou preenchimento (fill). */
  cor: string;
}

const W = 720;
const H = 200;
const M = { e: 52, d: 12, t: 12, b: 26 };

function escalaY(max: number): number[] {
  if (max <= 0) return [0];
  const passo = 10 ** Math.floor(Math.log10(max));
  const n = Math.ceil(max / passo);
  const p = n > 5 ? passo * 2 : passo;
  return Array.from({ length: Math.floor(max / p) + 2 }, (_, i) => i * p).filter((v, i, a) => i === 0 || a[i - 1]! < max);
}

const curto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export function Grafico({ rotulos, series, tipo = 'linha', altura = H, titulo }: { rotulos: string[]; series: SerieGrafico[]; tipo?: 'linha' | 'barras'; altura?: number; titulo?: string }) {
  const n = rotulos.length;
  if (!n) return <p className="text-sm text-zinc-500">Sem dados no período.</p>;
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const ticks = escalaY(max);
  const topo = Math.max(max, ticks.at(-1) ?? max);
  const x = (i: number) => M.e + ((W - M.e - M.d) * (n === 1 ? 0.5 : i / (n - 1)));
  const y = (v: number) => altura - M.b - ((altura - M.t - M.b) * v) / topo;
  const largura = ((W - M.e - M.d) / n) * 0.8 / series.length;
  const cada = Math.max(1, Math.ceil(n / 8));
  return (
    <figure className="w-full">
      {titulo ? <figcaption className="rotulo mb-1">{titulo}</figcaption> : null}
      <svg viewBox={`0 0 ${W} ${altura}`} className="h-auto w-full" role="img" aria-label={titulo ?? series.map((s) => s.nome).join(', ')}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.e} x2={W - M.d} y1={y(t)} y2={y(t)} className="stroke-zinc-200 dark:stroke-zinc-800" />
            <text x={M.e - 6} y={y(t) + 4} textAnchor="end" className="fill-zinc-500 text-[10px]">
              {curto.format(t)}
            </text>
          </g>
        ))}
        {rotulos.map((r, i) =>
          i % cada === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={altura - 8} textAnchor="middle" className="fill-zinc-500 text-[10px]">
              {r}
            </text>
          ) : null,
        )}
        {series.map((s, k) =>
          tipo === 'barras' ? (
            <g key={s.nome} className={s.cor}>
              {s.valores.map((v, i) => (
                <rect key={i} x={x(i) - (largura * series.length) / 2 + k * largura} y={y(v)} width={Math.max(1, largura)} height={Math.max(0, altura - M.b - y(v))} className="fill-current opacity-80">
                  <title>{`${rotulos[i]}: ${s.nome} ${v.toLocaleString('pt-BR')}`}</title>
                </rect>
              ))}
            </g>
          ) : (
            <g key={s.nome} className={s.cor}>
              <polyline fill="none" strokeWidth={2} className="stroke-current" points={s.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
            </g>
          ),
        )}
      </svg>
      {series.length > 1 ? (
        <div className="mt-1 flex gap-4 text-xs text-zinc-500">
          {series.map((s) => (
            <span key={s.nome} className="flex items-center gap-1">
              <span className={`inline-block size-2 rounded-full bg-current ${s.cor}`} /> {s.nome}
            </span>
          ))}
        </div>
      ) : null}
    </figure>
  );
}

/** Mapa de calor dia da semana x hora (ex.: quando a lotérica monta bolões). */
export function MapaDeCalor({ matriz, dias }: { matriz: number[][]; dias: string[] }) {
  const max = Math.max(1, ...matriz.flat());
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] tabular">
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="w-5 text-center font-normal text-zinc-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dias.map((nome, i) => (
            <tr key={nome}>
              <td className="pr-2 text-zinc-500">{nome}</td>
              {(matriz[i + 1] ?? []).map((v, h) => (
                <td key={h} title={`${nome} ${h}h: ${v}`} className="size-5 rounded-sm text-center" style={{ background: v ? `rgba(14, 165, 233, ${0.15 + (0.85 * v) / max})` : undefined }}>
                  {v || ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
