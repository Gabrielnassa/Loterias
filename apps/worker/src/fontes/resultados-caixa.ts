import { CAMINHO_RESULTADO_CAIXA, ClienteHttpEducado, normalizarResultadoCaixa, type ConcursoRef, type ResultadoOficial } from '@radar/core';

/**
 * Resultado e rateio OFICIAIS (API pública do portal de loterias da CAIXA). Uma requisição por
 * concurso, pelo cliente educado (intervalo mínimo, backoff, para em 401/403/captcha).
 */
export const BASE_RESULTADOS = 'https://servicebus2.caixa.gov.br/portaldeloterias/api';

export type BuscarResultado = (ref: ConcursoRef) => Promise<{ resultado: ResultadoOficial; bruto: unknown } | null>;

export function criarBuscaResultados(http: ClienteHttpEducado = new ClienteHttpEducado({ intervaloMinimoMs: 2000 }), base = BASE_RESULTADOS): BuscarResultado {
  return async (ref) => {
    const r = await http.obter(`${base}/${CAMINHO_RESULTADO_CAIXA[ref.modalidade]}/${ref.concurso}`, { esperaJson: true });
    if (r.status === 404) return null; // ainda não publicado
    const bruto = r.json();
    const resultado = normalizarResultadoCaixa(bruto);
    if (resultado.concurso !== ref.concurso || resultado.modalidade !== ref.modalidade) return null;
    return { resultado, bruto };
  };
}
