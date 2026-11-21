/**
 * Mediana com interpolação linear, compatível com percentile_cont(0.5) do PostgreSQL.
 * Retorna null para lista vazia.
 */
export function mediana(valores: readonly number[]): number | null {
  return percentil(valores, 0.5);
}

/** percentile_cont(p) do PostgreSQL (interpolação linear entre os vizinhos). */
export function percentil(valores: readonly number[], p: number): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const pos = (v.length - 1) * p;
  const baixo = Math.floor(pos);
  const alto = Math.ceil(pos);
  const a = v[baixo]!;
  const b = v[alto]!;
  return a + (b - a) * (pos - baixo);
}

export function media(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((s, x) => s + x, 0) / valores.length;
}

export function soma(valores: readonly number[]): number {
  return valores.reduce((s, x) => s + x, 0);
}

/** Arredonda para centavos evitando o erro clássico de ponto flutuante (1.005 -> 1.01). */
export function centavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
