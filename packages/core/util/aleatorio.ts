/** PRNG determinístico (mulberry32) para simulações e testes reprodutíveis. */
export function criarAleatorio(semente: number) {
  let s = semente >>> 0;
  const proximo = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    proximo,
    /** Inteiro em [min, max]. */
    inteiro(min: number, max: number): number {
      return min + Math.floor(proximo() * (max - min + 1));
    },
    escolher<T>(itens: readonly T[]): T {
      if (itens.length === 0) throw new Error('lista vazia');
      return itens[Math.floor(proximo() * itens.length)]!;
    },
    /** Escolha ponderada: pesos não precisam somar 1. */
    ponderado<T>(itens: readonly (readonly [T, number])[]): T {
      const total = itens.reduce((s, [, p]) => s + p, 0);
      let r = proximo() * total;
      for (const [item, peso] of itens) {
        r -= peso;
        if (r <= 0) return item;
      }
      return itens[itens.length - 1]![0];
    },
    /** Exponencial com média `media`. */
    exponencial(media: number): number {
      return -Math.log(1 - proximo()) * media;
    },
  };
}
export type Aleatorio = ReturnType<typeof criarAleatorio>;
