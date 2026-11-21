/**
 * Fila: o 1º bolão de cada lotérica no concurso forma a 1ª fila, o 2º a 2ª fila, etc.
 * Regra (SPEC, Motor de dados): fila = ordem do bolão entre os bolões da mesma lotérica no
 * concurso, por first_seen_at. Empate na mesma leitura: vale a ordem da fonte.
 *
 * Decisão: a fila é ESTÁTICA (atribuída na entrada e não muda se um bolão anterior da mesma
 * lotérica esgotar). Validar contra a vitrine real na Fase 0 (ver docs/fonte-caixa.md).
 */

export interface BolaoParaFila {
  id: string;
  lotericaCodigo: string;
  firstSeenAt: Date;
  /** Posição observada na leitura em que o bolão apareceu pela 1ª vez (desempate). */
  ordemFonte?: number;
}

/** Critério de ordem de chegada: first_seen_at, depois ordem da fonte, depois id. */
export function compararChegada(a: BolaoParaFila, b: BolaoParaFila): number {
  const dt = a.firstSeenAt.getTime() - b.firstSeenAt.getTime();
  if (dt !== 0) return dt;
  const oa = a.ordemFonte ?? Number.POSITIVE_INFINITY;
  const ob = b.ordemFonte ?? Number.POSITIVE_INFINITY;
  if (oa !== ob) return oa < ob ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Calcula a fila (1-based) de cada bolão de UM concurso. */
export function calcularFilas(boloes: readonly BolaoParaFila[]): Map<string, number> {
  const porLoterica = new Map<string, BolaoParaFila[]>();
  for (const b of boloes) {
    const lista = porLoterica.get(b.lotericaCodigo);
    if (lista) lista.push(b);
    else porLoterica.set(b.lotericaCodigo, [b]);
  }
  const filas = new Map<string, number>();
  for (const lista of porLoterica.values()) {
    lista.sort(compararChegada);
    lista.forEach((b, i) => filas.set(b.id, i + 1));
  }
  return filas;
}

/** Número de filas de um concurso (= maior fila). */
export function numeroDeFilas(filas: Iterable<number>): number {
  let max = 0;
  for (const f of filas) if (f > max) max = f;
  return max;
}
