import { diaSP, ehModalidade, isodowDoDia, prepararAberturas, proximaAbertura, simularPosicao, somarDias, type ModalidadeSlug } from '@radar/core';
import type { FonteDadosRaioX } from './dados';
import { minhaLoterica } from './minha';
import { aoVivo } from './servico';

/** "21:45:30" -> segundos desde o T0 do dia da semana (21:45, ou 11:45 no domingo). */
export function atrasoDaHora(hora: string | null | undefined, diaSemana: number): number {
  const m = hora ? /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hora) : null;
  const t0 = diaSemana === 7 ? 11 * 3600 + 45 * 60 : 21 * 3600 + 45 * 60;
  if (!m) return 30;
  return Math.max(0, Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) - t0);
}

export function horaDoAtraso(atrasoS: number, diaSemana: number): string {
  const t = (diaSemana === 7 ? 11 * 3600 + 45 * 60 : 21 * 3600 + 45 * 60) + Math.round(atrasoS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600) % 24)}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}

/** Simulador de posição para a lotérica do dono (curva de chegada das últimas aberturas do dia da semana). */
export async function simuladorDePosicao(
  fonte: FonteDadosRaioX,
  o: { loja?: string | null; modalidade?: string | null; diaSemana?: number | null; hora?: string | null; semanas?: number } = {},
) {
  const loterica = await minhaLoterica(fonte, o.loja);
  const agora = fonte.agora();
  const diaSemana = o.diaSemana && o.diaSemana >= 1 && o.diaSemana <= 7 ? o.diaSemana : isodowDoDia(somarDias(diaSP(agora), 1));
  const modalidade: ModalidadeSlug | 'todas' = o.modalidade && ehModalidade(o.modalidade) ? o.modalidade : 'todas';
  const atrasoS = atrasoDaHora(o.hora, diaSemana);
  const [aberturas, participacoes, lotericas] = await Promise.all([fonte.aberturas(), fonte.participacoes(), fonte.lotericas()]);
  const porCodigo = new Map(lotericas.map((l) => [l.codigoCaixa, l]));
  const prep = prepararAberturas({ aberturas, participacoes, localDe: (c) => porCodigo.get(c), minha: loterica, modalidade, diaSemana, ate: agora, semanas: o.semanas ?? 8 });
  return { loterica, hora: horaDoAtraso(atrasoS, diaSemana), ...simularPosicao(prep, { atrasoS, diaSemana, modalidade }) };
}

/** Dados do Cronômetro: próxima abertura, limite para a pág. 1 e o placar ao vivo. */
export async function cronometro(fonte: FonteDadosRaioX, o: { loja?: string | null } = {}) {
  const loterica = await minhaLoterica(fonte, o.loja);
  const agora = fonte.agora();
  const prox = proximaAbertura(agora);
  const dow = isodowDoDia(diaSP(prox.t0));
  const sim = await simuladorDePosicao(fonte, { loja: loterica.codigoCaixa, diaSemana: dow });
  const placar = await aoVivo(fonte, { uf: loterica.uf || 'SP', destaque: loterica.codigoCaixa });
  return { loterica, agora, proxima: prox, limitePagina1: sim.limitePagina1, aberturasBase: sim.porEscopo[1]?.aberturas ?? 0, placar };
}
