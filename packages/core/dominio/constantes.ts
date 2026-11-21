/**
 * Constantes do domínio. Valores vêm da SPEC.md (Glossário e Motor de dados).
 * Qualquer mudança aqui muda números exibidos ao cliente: altere com teste.
 */

/** Fuso oficial de todas as regras de calendário (semana, dia, T0, franquia). */
export const FUSO = 'America/Sao_Paulo';

/** A vitrine do Marketplace mostra 30 bolões por página. */
export const BOLOES_POR_PAGINA = 30;

/** Tarifa de serviço: 35% sobre o valor base das cotas vendidas pela internet (receita da lotérica). */
export const TAXA_TARIFA = 0.35;

/** Comissão paga pela CAIXA: 8,61% sobre as apostas dos bolões que venderam ao menos 1 cota. */
export const TAXA_COMISSAO = 0.0861;

/** Janela da franquia diária, em horário de São Paulo: [05:00, 23:00). */
export const FRANQUIA_INICIO = { hora: 5, minuto: 0 } as const;
export const FRANQUIA_FIM = { hora: 23, minuto: 0 } as const;

/** T0 padrão da abertura: 21:45 de segunda a sábado e 11:45 no domingo (configurável por concurso). */
export const T0_PADRAO_SEG_SAB = { hora: 21, minuto: 45 } as const;
export const T0_PADRAO_DOMINGO = { hora: 11, minuto: 45 } as const;

/** Janela da abertura e limite para contar participação (minutos após T0). */
export const ABERTURA_JANELA_MIN = 60;
export const ABERTURA_PARTICIPACAO_MIN = 30;

/** Faixas de página usadas para colorir a grade do Raio-X. */
export type FaixaPagina = 'pag1' | 'pag2-3' | 'pag4+';
