import { z } from 'zod';
import type { ModalidadeSlug } from '../dominio/modalidades';
import { FormatoInesperadoError } from '../fonte/erros';
import { MODALIDADES_CAIXA } from '../fonte/adaptadores/caixa-bruto';

/**
 * Resultado e rateio OFICIAIS da CAIXA (API pública do portal de loterias:
 * https://servicebus2.caixa.gov.br/portaldeloterias/api/{modalidade}/{concurso}). Formato conferido
 * em 21/11/2026 com a Mega-Sena 3.088 (fixture em fonte/fixtures/resultados/).
 */
export const CAMINHO_RESULTADO_CAIXA: Record<ModalidadeSlug, string> = {
  'mega-sena': 'megasena',
  lotofacil: 'lotofacil',
  quina: 'quina',
  lotomania: 'lotomania',
  'dupla-sena': 'duplasena',
  timemania: 'timemania',
  'dia-de-sorte': 'diadesorte',
  'super-sete': 'supersete',
  'mais-milionaria': 'maismilionaria',
  loteca: 'loteca',
};

export interface Rateio {
  faixa: number;
  descricao: string;
  /** Acertos da faixa ("4 acertos" -> 4); null se a descrição não traz número. */
  acertos: number | null;
  ganhadores: number;
  valorPremio: number;
}

export interface ResultadoOficial {
  modalidade: ModalidadeSlug;
  concurso: number;
  /** YYYY-MM-DD */
  dataApuracao: string;
  dezenas: number[];
  /** 2º sorteio (Dupla Sena). */
  dezenas2?: number[];
  rateios: Rateio[];
  acumulado: boolean;
}

const esquema = z
  .object({
    numero: z.number().int().positive(),
    tipoJogo: z.string(),
    dataApuracao: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
    listaDezenas: z.array(z.union([z.string(), z.number()])).min(1),
    listaDezenasSegundoSorteio: z.array(z.union([z.string(), z.number()])).nullable().optional(),
    listaRateioPremio: z.array(
      z.object({ descricaoFaixa: z.string(), faixa: z.number().int(), numeroDeGanhadores: z.number().int(), valorPremio: z.number() }).passthrough(),
    ),
    acumulado: z.boolean().optional(),
  })
  .passthrough();

export function normalizarResultadoCaixa(json: unknown): ResultadoOficial {
  const r = esquema.safeParse(json);
  if (!r.success) {
    throw new FormatoInesperadoError(`resultado da CAIXA fora do contrato: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const d = r.data;
  const modalidade = MODALIDADES_CAIXA[d.tipoJogo];
  if (!modalidade) throw new FormatoInesperadoError(`modalidade desconhecida no resultado: ${d.tipoJogo}`);
  const [dia, mes, ano] = d.dataApuracao.split('/');
  const out: ResultadoOficial = {
    modalidade,
    concurso: d.numero,
    dataApuracao: `${ano}-${mes}-${dia}`,
    dezenas: d.listaDezenas.map(Number),
    rateios: d.listaRateioPremio.map((x) => {
      const m = /(\d+)\s*acerto/i.exec(x.descricaoFaixa);
      return { faixa: x.faixa, descricao: x.descricaoFaixa, acertos: m ? Number(m[1]) : null, ganhadores: x.numeroDeGanhadores, valorPremio: x.valorPremio };
    }),
    acumulado: d.acumulado ?? false,
  };
  if (d.listaDezenasSegundoSorteio?.length) out.dezenas2 = d.listaDezenasSegundoSorteio.map(Number);
  return out;
}
