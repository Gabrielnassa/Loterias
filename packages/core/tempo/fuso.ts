import { FUSO, T0_PADRAO_DOMINGO, T0_PADRAO_SEG_SAB } from '../dominio/constantes';

/**
 * Utilitários de calendário no fuso America/Sao_Paulo usando apenas Intl (sem dependências).
 * O processo pode rodar em qualquer TZ (em produção, UTC): nada aqui usa o fuso da máquina.
 */

export interface PartesData {
  ano: number;
  mes: number; // 1..12
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
  /** 1 = segunda ... 7 = domingo (ISO). */
  isodow: number;
}

const FORMATADOR = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

const DIA_SEMANA: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function partesSP(data: Date): PartesData {
  const p: Record<string, string> = {};
  for (const parte of FORMATADOR.formatToParts(data)) p[parte.type] = parte.value;
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
    segundo: Number(p.second),
    isodow: DIA_SEMANA[p.weekday ?? ''] ?? 0,
  };
}

/** Diferença (ms) entre o relógio de parede de SP e UTC no instante dado (negativa: SP atrás de UTC). */
function deslocamentoMs(instante: number): number {
  const p = partesSP(new Date(instante));
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoUtc - Math.floor(instante / 1000) * 1000;
}

/** Converte um horário de parede em São Paulo para o instante (Date). */
export function horarioSP(ano: number, mes: number, dia: number, hora = 0, minuto = 0, segundo = 0, ms = 0): Date {
  const parede = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo, ms);
  // Duas iterações resolvem transições de horário de verão (não há desde 2019, mas o histórico existe).
  let instante = parede - deslocamentoMs(parede);
  instante = parede - deslocamentoMs(instante);
  return new Date(instante);
}

/** Dia (YYYY-MM-DD) em São Paulo. */
export function diaSP(data: Date): string {
  const p = partesSP(data);
  return `${p.ano}-${pad(p.mes)}-${pad(p.dia)}`;
}

/** Hora (HH:MM:SS) em São Paulo. */
export function horaSP(data: Date): string {
  const p = partesSP(data);
  return `${pad(p.hora)}:${pad(p.minuto)}:${pad(p.segundo)}`;
}

export function lerDia(dia: string): { ano: number; mes: number; dia: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) throw new Error(`dia inválido: ${dia}`);
  return { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

/** Soma `n` dias a um dia de calendário (YYYY-MM-DD). */
export function somarDias(dia: string, n: number): string {
  const d = lerDia(dia);
  const t = new Date(Date.UTC(d.ano, d.mes - 1, d.dia + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Dia da semana ISO (1 = segunda ... 7 = domingo) de um dia de calendário. */
export function isodowDoDia(dia: string): number {
  const d = lerDia(dia);
  const js = new Date(Date.UTC(d.ano, d.mes - 1, d.dia)).getUTCDay(); // 0 = domingo
  return js === 0 ? 7 : js;
}

/** Segunda-feira (YYYY-MM-DD) da semana de `data`, em São Paulo. Semana = segunda a domingo. */
export function semanaSP(data: Date): string {
  const dia = diaSP(data);
  return somarDias(dia, 1 - isodowDoDia(dia));
}

/** Instante de 00:00 em São Paulo do dia informado. */
export function inicioDoDiaSP(dia: string): Date {
  const d = lerDia(dia);
  return horarioSP(d.ano, d.mes, d.dia);
}

/** Instante em São Paulo de um dia + horário. */
export function noDiaSP(dia: string, hora: number, minuto: number, segundo = 0): Date {
  const d = lerDia(dia);
  return horarioSP(d.ano, d.mes, d.dia, hora, minuto, segundo);
}

/** T0 padrão da abertura no dia: 21:45 de segunda a sábado; 11:45 no domingo. */
export function t0Padrao(dia: string): Date {
  const h = isodowDoDia(dia) === 7 ? T0_PADRAO_DOMINGO : T0_PADRAO_SEG_SAB;
  return noDiaSP(dia, h.hora, h.minuto);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
