/**
 * Código CAIXA da lotérica. A mesma lotérica aparece em formas diferentes (exemplo real: Coli
 * Loterias, São Paulo/SP):
 *   "21.002894-7"  código completo (2 dígitos + número de 6 dígitos + dígito verificador)
 *   "210028947"    o mesmo, sem pontuação (como aparece no oLoterico)
 *   "002894"       6 dígitos (filtro de lotérica do portal)
 *   2894           campo `loterica` (numérico) do JSON da API  <- forma CANÔNICA usada no sistema
 */
export function normalizarCodigoLoterica(entrada: string | number): string | null {
  const digitos = String(entrada).replace(/\D/g, '');
  if (!digitos) return null;
  let numero: string;
  if (digitos.length === 9) numero = digitos.slice(2, 8); // 2 + 6 + DV
  else if (digitos.length === 8) numero = digitos.slice(2); // 2 + 6, sem DV
  else if (digitos.length <= 6) numero = digitos;
  else return null; // 7 ou 10+ dígitos: forma desconhecida, melhor recusar do que adivinhar
  const semZeros = numero.replace(/^0+/, '');
  return semZeros || null;
}

/** Forma de 6 dígitos (filtro do portal). */
export function codigoLotericaSeisDigitos(entrada: string | number): string | null {
  const c = normalizarCodigoLoterica(entrada);
  return c ? c.padStart(6, '0') : null;
}

export function mesmoCodigoLoterica(a: string | number, b: string | number): boolean {
  const x = normalizarCodigoLoterica(a);
  return x !== null && x === normalizarCodigoLoterica(b);
}

export interface LotericaConfigurada {
  /** Forma canônica (como no JSON da API). */
  codigoCaixa: string;
  /** Como foi escrito na configuração (para exibir). */
  codigoInformado: string;
  nome?: string;
}

/**
 * Lê a lista de lotéricas do dono (multi-loja): entradas separadas por vírgula ou ponto e vírgula,
 * cada uma `código` ou `código=Nome`. Ex.: "21.002894-7=Coli Loterias, 002895=Loja Bairro".
 * Códigos inválidos geram erro (melhor falhar na partida do que mostrar a loja errada).
 */
export function lerLotericasConfiguradas(valor: string | undefined | null): LotericaConfigurada[] {
  if (!valor?.trim()) return [];
  const vistas = new Set<string>();
  const r: LotericaConfigurada[] = [];
  for (const parte of valor.split(/[,;]/)) {
    const t = parte.trim();
    if (!t) continue;
    const [codigoBruto, ...resto] = t.split('=');
    const codigo = normalizarCodigoLoterica(codigoBruto!.trim());
    if (!codigo) throw new Error(`código de lotérica inválido na configuração: "${codigoBruto}"`);
    if (vistas.has(codigo)) continue;
    vistas.add(codigo);
    const nome = resto.join('=').trim();
    r.push({ codigoCaixa: codigo, codigoInformado: codigoBruto!.trim(), ...(nome ? { nome } : {}) });
  }
  return r;
}
