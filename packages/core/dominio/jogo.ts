/** Loteca: coluna 1 (vitória do time 1), X (empate, "coluna do meio") ou 2 (vitória do time 2). */
export type ColunaLoteca = '1' | 'X' | '2';

/** Um jogo (aposta) de um bolão com as marcações de cada modalidade. */
export interface JogoBolao {
  /** Números marcados (vazio no Super Sete e na Loteca). */
  numeros: number[];
  /** +Milionária. */
  trevos?: number[];
  /** Timemania (nome do clube; a comparação ignora acento, caixa e pontuação). */
  timeCoracao?: string;
  /** Dia de Sorte, 1 a 12. */
  mesSorte?: number;
  /** Super Sete: dígitos marcados em cada uma das 7 colunas. */
  colunas?: number[][];
  /** Loteca: colunas marcadas em cada um dos 14 jogos ("1", "X", "2"; duplo e triplo = 2 e 3). */
  palpites?: ColunaLoteca[][];
}

export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] as const;

/** "Junho", "junho", "JUN", 6 ou "06" -> 6. */
export function mesDaSorte(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || /^\s*\d{1,2}\s*$/.test(v)) {
    const n = Number(v);
    return n >= 1 && n <= 12 ? n : null;
  }
  const s = semAcento(v).toLowerCase().trim();
  if (s.length < 3) return null;
  const i = MESES.findIndex((m) => m.startsWith(s.slice(0, 3)) && (s.length === 3 || m === s));
  return i >= 0 ? i + 1 : null;
}

/** Nome do clube comparável: sem acento, maiúsculo, só letras e números ("Cuiabá/MT" == "CUIABA     /MT"). */
export function normalizarTime(nome: string): string {
  return semAcento(nome).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

