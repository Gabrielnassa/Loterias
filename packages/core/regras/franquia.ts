import { FRANQUIA_FIM, FRANQUIA_INICIO } from '../dominio/constantes';
import { noDiaSP } from '../tempo/fuso';
import { centavos } from '../util/estatistica';

/**
 * Franquia diária: teto em R$ (valor sem tarifa) que a lotérica pode subir por dia.
 * Franquia usada = soma do valor sem tarifa dos bolões inseridos entre 05:00 e 23:00 (SP).
 * Janela adotada: [05:00:00, 23:00:00) — fim exclusivo.
 * Estornados contam por padrão (o limite é sobre o que foi inserido); confirmar com a CAIXA.
 */
export interface BolaoParaFranquia {
  inseridoEm: Date;
  cotasTotal: number;
  valorCotaBase: number;
  estornado?: boolean;
}

export function janelaFranquia(dia: string): { inicio: Date; fim: Date } {
  return {
    inicio: noDiaSP(dia, FRANQUIA_INICIO.hora, FRANQUIA_INICIO.minuto),
    fim: noDiaSP(dia, FRANQUIA_FIM.hora, FRANQUIA_FIM.minuto),
  };
}

export function franquiaUsada(
  boloes: readonly BolaoParaFranquia[],
  dia: string,
  opcoes: { contarEstornados?: boolean } = {},
): number {
  const { inicio, fim } = janelaFranquia(dia);
  const contarEstornados = opcoes.contarEstornados ?? true;
  let total = 0;
  for (const b of boloes) {
    const t = b.inseridoEm.getTime();
    if (t < inicio.getTime() || t >= fim.getTime()) continue;
    if (b.estornado && !contarEstornados) continue;
    total += b.cotasTotal * b.valorCotaBase;
  }
  return centavos(total);
}

export function franquiaDisponivel(limite: number, usado: number): number {
  return centavos(Math.max(0, limite - usado));
}
