import type { ModalidadeSlug } from '../dominio/modalidades';
import { isodowDoDia, noDiaSP } from '../tempo/fuso';

/**
 * T0 (abertura) POR CONCURSO, nunca fixo no código. A previsão sai de uma tabela de regras padrão
 * editável (`regras_abertura` no banco) e é corrigida pela 1ª vez que um bolão do concurso aparece.
 *
 * Observações que basearam as regras padrão (oLoterico, 21/11/2026):
 *  - Mega-Sena, Lotofácil, Timemania e Dia de Sorte fecham dom 10:45 e sorteiam 11:00; a Mega-Sena
 *    3.090 aparecia com "abre dom 22/11 11:45" => abre 45 min depois do sorteio do concurso anterior;
 *  - Lotofácil 3.840 aparecia com "abre qui 26/11 21:45" (sorteio do anterior às 21:00).
 */
export type OrigemT0 = 'regra' | 'fonte' | 'primeiro_bolao' | 'manual';

export interface RegraAbertura {
  id: string;
  /** null = todas as modalidades. */
  modalidade?: ModalidadeSlug | null;
  /** Dia ISO do sorteio do concurso anterior (1 = seg ... 7 = dom); null = todos. */
  diaSemana?: number | null;
  /** T0 = sorteio do concurso anterior + N minutos (precisa da hora do sorteio). */
  minutosAposSorteio?: number | null;
  /** T0 = este horário no dia do sorteio do concurso anterior (quando não há hora do sorteio). */
  horaPadrao?: { hora: number; minuto: number } | null;
  /** Menor = avaliada antes. */
  prioridade: number;
  ativo: boolean;
  observacao?: string;
}

export const REGRAS_ABERTURA_PADRAO: readonly RegraAbertura[] = [
  { id: 'apos-sorteio', minutosAposSorteio: 45, prioridade: 10, ativo: true, observacao: 'abre 45 min depois do sorteio do concurso anterior' },
  { id: 'domingo-sem-hora', diaSemana: 7, horaPadrao: { hora: 11, minuto: 45 }, prioridade: 50, ativo: true, observacao: 'sem hora do sorteio: domingo 11:45' },
  { id: 'seg-sab-sem-hora', horaPadrao: { hora: 21, minuto: 45 }, prioridade: 90, ativo: true, observacao: 'sem hora do sorteio: 21:45' },
];

export interface ConcursoParaPrever {
  modalidade: ModalidadeSlug;
  concurso: number;
  /** Dia do sorteio (YYYY-MM-DD). */
  dataSorteio?: string;
  /** Instante do sorteio (dia + hora), se a fonte informar. */
  sorteioEm?: Date;
}

export interface PrevisaoAbertura {
  modalidade: ModalidadeSlug;
  concurso: number;
  abreEm: Date;
  regra: string;
}

/** Previsão do T0 do concurso SEGUINTE a partir do sorteio do concurso atual. */
export function preverAbertura(atual: ConcursoParaPrever, regras: readonly RegraAbertura[] = REGRAS_ABERTURA_PADRAO): PrevisaoAbertura | null {
  if (!atual.dataSorteio) return null;
  const isodow = isodowDoDia(atual.dataSorteio);
  const ordenadas = regras.filter((r) => r.ativo).sort((a, b) => a.prioridade - b.prioridade);
  for (const r of ordenadas) {
    if (r.modalidade && r.modalidade !== atual.modalidade) continue;
    if (r.diaSemana && r.diaSemana !== isodow) continue;
    let abreEm: Date | null = null;
    if (r.minutosAposSorteio !== undefined && r.minutosAposSorteio !== null) {
      if (!atual.sorteioEm) continue;
      abreEm = new Date(atual.sorteioEm.getTime() + r.minutosAposSorteio * 60_000);
    } else if (r.horaPadrao) {
      abreEm = noDiaSP(atual.dataSorteio, r.horaPadrao.hora, r.horaPadrao.minuto);
    }
    if (abreEm) return { modalidade: atual.modalidade, concurso: atual.concurso + 1, abreEm, regra: r.id };
  }
  return null;
}

export interface EntradaAjusteT0 {
  previsto: Date;
  origem: OrigemT0;
  /** Última leitura COMPLETA em que o concurso estava vazio. */
  ultimaLeituraVaziaEm: Date | null;
  /** Quando o 1º bolão do concurso apareceu. */
  primeiroVistoEm: Date;
  /** Diferença até a qual a previsão é mantida. Default 2 min. */
  toleranciaMs?: number;
  /** Lacuna máxima entre a leitura vazia e o 1º bolão para confiar no ajuste. Default 5 min. */
  maxLacunaMs?: number;
}

/**
 * Ajuste do T0 pela 1ª vez que um bolão do concurso aparece: T0 = minuto cheio em que ele apareceu,
 * se isso diferir da previsão em mais que a tolerância. Só ajusta se o concurso foi visto VAZIO pouco
 * antes (senão não dá para saber quando abriu) e nunca mexe em T0 manual ou já ajustado.
 */
export function ajustarT0(e: EntradaAjusteT0): { abreEm: Date; origem: OrigemT0 } | null {
  if (e.origem === 'manual' || e.origem === 'primeiro_bolao') return null;
  if (!e.ultimaLeituraVaziaEm) return null;
  if (e.primeiroVistoEm.getTime() - e.ultimaLeituraVaziaEm.getTime() > (e.maxLacunaMs ?? 5 * 60_000)) return null;
  const candidato = new Date(Math.floor(e.primeiroVistoEm.getTime() / 60_000) * 60_000);
  if (Math.abs(candidato.getTime() - e.previsto.getTime()) <= (e.toleranciaMs ?? 2 * 60_000)) return null;
  return { abreEm: candidato, origem: 'primeiro_bolao' };
}
