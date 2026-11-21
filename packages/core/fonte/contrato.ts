import { z } from 'zod';
import { SLUGS_MODALIDADE } from '../dominio/modalidades';
import { FormatoInesperadoError } from './erros';
import type { PaginaBoloes } from './tipos';

/**
 * Teste de contrato do formato NORMALIZADO. Todo adaptador concreto deve passar a sua saída
 * por `validarPagina` — se a CAIXA mudar o formato, o erro aparece aqui e não no banco.
 */

const inteiroPositivo = z.number().int().positive();
const inteiroNaoNegativo = z.number().int().nonnegative();

export const esquemaLoterica = z.object({
  codigoCaixa: z.string().min(1),
  nome: z.string().min(1),
  cidade: z.string().min(1),
  uf: z.string().regex(/^[A-Z]{2}$/, 'UF deve ter 2 letras maiúsculas'),
  bairro: z.string().optional(),
});

export const esquemaBolao = z
  .object({
    idCaixa: z.string().min(1),
    loterica: esquemaLoterica,
    modalidade: z.enum(SLUGS_MODALIDADE),
    concurso: inteiroPositivo,
    jogos: inteiroPositivo,
    dezenas: inteiroPositivo,
    cotasTotal: inteiroPositivo,
    cotasDisponiveis: inteiroNaoNegativo,
    valorCotaBase: z.number().positive(),
    valorCotaExibido: z.number().positive().optional(),
    numeros: z.array(z.array(z.number().int())).optional(),
    inseridoEmFonte: z.date().optional(),
    filaFonte: inteiroPositivo.optional(),
    cotasDigitais: inteiroNaoNegativo.optional(),
    contemResiduo: z.boolean().optional(),
    valorUltimaCotaBase: z.number().positive().optional(),
    tarifaPorCotaFonte: z.number().nonnegative().optional(),
    trevos: inteiroNaoNegativo.optional(),
  })
  .refine((b) => b.cotasDisponiveis <= b.cotasTotal, { message: 'cotasDisponiveis > cotasTotal' })
  .refine((b) => !b.numeros || b.numeros.length === b.jogos, { message: 'numeros.length != jogos' })
  .refine((b) => b.cotasDigitais === undefined || b.cotasDigitais <= b.cotasTotal, { message: 'cotasDigitais > cotasTotal' });

export const esquemaPagina = z.object({
  consulta: z.object({
    modalidade: z.enum(SLUGS_MODALIDADE),
    concurso: inteiroPositivo,
    pagina: inteiroPositivo,
    uf: z.string().optional(),
    cidade: z.string().optional(),
    codigoLoterica: z.string().optional(),
  }),
  pagina: inteiroPositivo,
  tamanhoPagina: inteiroPositivo,
  totalPaginas: inteiroNaoNegativo.optional(),
  totalItens: inteiroNaoNegativo.optional(),
  itens: z.array(esquemaBolao),
  ordemDaVitrine: z.boolean(),
  obtidaEm: z.date(),
  horaServidor: z.date().optional(),
});

export function validarPagina(p: unknown): PaginaBoloes {
  const r = esquemaPagina.safeParse(p);
  if (!r.success) {
    const resumo = r.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new FormatoInesperadoError(`página fora do contrato: ${resumo}`, r.error.issues);
  }
  const pagina = r.data as PaginaBoloes;
  if (pagina.itens.length > pagina.tamanhoPagina) {
    throw new FormatoInesperadoError(`página com ${pagina.itens.length} itens > tamanho ${pagina.tamanhoPagina}`);
  }
  for (const b of pagina.itens) {
    if (b.modalidade !== pagina.consulta.modalidade || b.concurso !== pagina.consulta.concurso) {
      throw new FormatoInesperadoError(`bolão ${b.idCaixa} de outro concurso (${b.modalidade} ${b.concurso})`);
    }
  }
  return pagina;
}
