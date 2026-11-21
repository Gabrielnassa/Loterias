/**
 * Código do bolão: jogos, dezenas e cotas. Ex.: 6J-17D-40C = 6 jogos de 17 dezenas, 40 cotas.
 */
export interface FormatoBolao {
  jogos: number;
  dezenas: number;
  cotas: number;
}

export function formatarCodigoBolao(f: FormatoBolao): string {
  return `${f.jogos}J-${f.dezenas}D-${f.cotas}C`;
}

const RE_CODIGO = /^\s*(\d+)\s*J\s*-\s*(\d+)\s*D\s*-\s*(\d+)\s*C\s*$/i;

export function lerCodigoBolao(codigo: string): FormatoBolao | null {
  const m = RE_CODIGO.exec(codigo);
  if (!m) return null;
  const [jogos, dezenas, cotas] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (jogos < 1 || dezenas < 1 || cotas < 1) return null;
  return { jogos, dezenas, cotas };
}
