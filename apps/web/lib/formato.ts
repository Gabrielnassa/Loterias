/** Formatação para a interface (sem depender do core: pode ir para componentes de cliente). */
const FUSO = 'America/Sao_Paulo';
const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const dataCurta = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
const dataLonga = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inteiro = new Intl.NumberFormat('pt-BR');

export const fmtHora = (d: Date | string) => hora.format(new Date(d));
export const fmtDataCurta = (d: Date | string) => dataCurta.format(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T15:00:00Z`) : new Date(d));
export const fmtDataLonga = (d: Date | string) => dataLonga.format(new Date(d));
export const fmtMoeda = (v: number) => moeda.format(v);
export const fmtInt = (v: number) => inteiro.format(v);
export const fmtPct = (v: number | null | undefined, casas = 0) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(casas).replace('.', ',')}%`);

/** Atraso desde T0: "+7 s", "+2 min 05 s". */
export function fmtAtraso(s: number | null | undefined): string {
  if (s === null || s === undefined) return '—';
  const t = Math.round(s);
  if (t < 60) return `+${t} s`;
  const m = Math.floor(t / 60);
  const r = t % 60;
  return `+${m} min ${String(r).padStart(2, '0')} s`;
}

export const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export const NOME_MODALIDADE: Record<string, string> = {
  'mega-sena': 'Mega-Sena',
  lotofacil: 'Lotofácil',
  quina: 'Quina',
  lotomania: 'Lotomania',
  'dupla-sena': 'Dupla Sena',
  timemania: 'Timemania',
  'dia-de-sorte': 'Dia de Sorte',
  'super-sete': 'Super Sete',
  'mais-milionaria': '+Milionária',
  loteca: 'Loteca',
};

export const NOME_ESCOPO: Record<string, string> = { cidade: 'Cidade', uf: 'Estado (UF)', brasil: 'Brasil' };
