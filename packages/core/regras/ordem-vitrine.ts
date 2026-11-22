/**
 * Ordem DENTRO da fila na vitrine: regra plugável.
 *
 * A SPEC diz "dentro da fila vale a ordem de chegada". A foto real da vitrine de São Paulo
 * (21/11/2026) põe isso em dúvida: as primeiras páginas são só da 1ª fila, mas há trocas pontuais
 * entre as filas 1 e 2 (Mega-Sena: 41 quedas de fila em 542 bolões) e o número do bolão não cresce
 * com a posição dentro da 1ª fila; a circular da CAIXA fala em ordem "aleatória". Até a gravação de
 * uma abertura responder, a colocação calculada aceita duas regras:
 *  - 'fila-chegada' (padrão, hipótese da SPEC): (fila, chegada, ordem da fonte);
 *  - 'fila-aleatoria': a fila define o bloco; dentro dele a posição é a ESPERADA (meio do bloco).
 */
export type RegraOrdemVitrine = 'fila-chegada' | 'fila-aleatoria';
export const REGRAS_ORDEM_VITRINE: readonly RegraOrdemVitrine[] = ['fila-chegada', 'fila-aleatoria'];
export const REGRA_ORDEM_PADRAO: RegraOrdemVitrine = 'fila-chegada';

/** Posição esperada de um item sorteado num bloco que começa em `inicio` e tem `tamanho` itens. */
export function posicaoEsperadaNoBloco(inicio: number, tamanho: number): number {
  return inicio + Math.floor((tamanho - 1) / 2);
}

export interface ItemOrdem {
  fila: number;
  /** Número do bolão (3º campo do codigoBolao): cresce com a criação do bolão. */
  numeroBolao?: number | null;
  /** Instante (ms) em que o bolão foi visto pela 1ª vez (chegada). */
  chegada?: number | null;
}

/** Correlação de postos de Spearman (com empates pela média dos postos). null com menos de 3 pares. */
export function spearman(x: readonly number[], y: readonly number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const postos = (v: readonly number[]) => {
    const idx = v.slice(0, n).map((val, i) => [val, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(n);
    for (let i = 0; i < n; ) {
      let j = i;
      while (j + 1 < n && idx[j + 1]![0] === idx[i]![0]) j++;
      for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const a = postos(x);
  const b = postos(y);
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da && db ? Math.round((num / Math.sqrt(da * db)) * 1000) / 1000 : null;
}

export interface DiagnosticoOrdem {
  itens: number;
  /** Vezes em que a fila diminui ao seguir a lista (com ordem estrita por fila seria 0). */
  quedasDeFila: number;
  /** Bolões da 1ª fila que aparecem depois de um da 2ª. */
  trocasFila1e2: number;
  /** Correlação entre a posição na 1ª fila e o número do bolão / a chegada (1 = mesma ordem). */
  spearmanNumeroNaFila1: number | null;
  spearmanChegadaNaFila1: number | null;
  /** Leitura do resultado (não é prova: uma abertura gravada a cada 5 s é o teste). */
  conclusao: 'ordem-de-chegada' | 'sem-relacao-com-a-chegada' | 'inconclusivo';
}

/** Mede o quanto a ordem observada (lista na ordem da vitrine) segue cada hipótese. */
export function diagnosticarOrdem(itens: readonly ItemOrdem[]): DiagnosticoOrdem {
  let quedas = 0;
  let trocas = 0;
  for (let i = 1; i < itens.length; i++) {
    if (itens[i]!.fila < itens[i - 1]!.fila) quedas++;
    if (itens[i]!.fila === 1 && itens[i - 1]!.fila === 2) trocas++;
  }
  const f1 = itens.map((it, pos) => ({ ...it, pos })).filter((it) => it.fila === 1);
  const comNumero = f1.filter((it) => typeof it.numeroBolao === 'number');
  const comChegada = f1.filter((it) => typeof it.chegada === 'number');
  const sNum = spearman(comNumero.map((it) => it.pos), comNumero.map((it) => it.numeroBolao!));
  const sCheg = spearman(comChegada.map((it) => it.pos), comChegada.map((it) => it.chegada!));
  const ref = sCheg ?? sNum;
  const conclusao = ref === null ? 'inconclusivo' : ref >= 0.8 ? 'ordem-de-chegada' : Math.abs(ref) <= 0.3 ? 'sem-relacao-com-a-chegada' : 'inconclusivo';
  return { itens: itens.length, quedasDeFila: quedas, trocasFila1e2: trocas, spearmanNumeroNaFila1: sNum, spearmanChegadaNaFila1: sCheg, conclusao };
}
