import { combinacoes, type ModalidadeSlug } from '../dominio/modalidades';
import { centavos } from '../util/estatistica';
import type { ResultadoOficial } from './resultado';

/**
 * Conferência de prêmios (Fase 3, "Conferência MKP"). Modalidades "escolha k de N": cada aposta com
 * n números cobre C(n, k) jogos simples; os que acertam exatamente j das dezenas sorteadas são
 * C(h, j) x C(n − h, k − j), com h = acertos da aposta. Ex.: Mega com 9 números que acerta 5 leva
 * 4 quinas e 30 quadras. Prêmio da faixa = quantidade x valor do rateio oficial.
 *
 * SPEC: seu prêmio (da lotérica) = prêmio total do bolão / cotas totais x cotas que SOBRARAM
 * (as cotas encalhadas ficam com a lotérica). Prêmios não entram no resultado financeiro.
 */
export const REGRAS_CONFERENCIA: Partial<Record<ModalidadeSlug, { k: number; dupla?: boolean }>> = {
  'mega-sena': { k: 6 },
  quina: { k: 5 },
  lotofacil: { k: 15 },
  'dupla-sena': { k: 6, dupla: true },
};

export function modalidadeConferivel(m: ModalidadeSlug): boolean {
  return m in REGRAS_CONFERENCIA;
}

export interface PremioFaixa {
  sorteio: 1 | 2;
  acertos: number;
  quantidade: number;
  valorUnitario: number;
  valor: number;
}

export interface PremioAposta {
  numeros: number[];
  acertos: number;
  faixas: PremioFaixa[];
  total: number;
}

function premiarContra(numeros: number[], dezenas: number[], k: number, rateios: ResultadoOficial['rateios'], sorteio: 1 | 2, faixasDupla: boolean): { acertos: number; faixas: PremioFaixa[] } {
  const sorteadas = new Set(dezenas);
  const h = numeros.filter((x) => sorteadas.has(x)).length;
  const n = numeros.length;
  const faixas: PremioFaixa[] = [];
  // na Dupla Sena o rateio lista as faixas do 1º e do 2º sorteio em sequência
  const doSorteio = faixasDupla ? rateios.filter((r) => (sorteio === 1 ? /1[ºo°]? ?sorteio|^[^2]*$/i.test(r.descricao) : /2[ºo°]? ?sorteio/i.test(r.descricao))) : rateios;
  for (const r of doSorteio) {
    if (r.acertos === null || r.acertos > h) continue;
    const q = combinacoes(h, r.acertos) * combinacoes(n - h, k - r.acertos);
    if (q > 0) faixas.push({ sorteio, acertos: r.acertos, quantidade: q, valorUnitario: r.valorPremio, valor: centavos(q * r.valorPremio) });
  }
  return { acertos: h, faixas };
}

export function premioDaAposta(numeros: number[], resultado: ResultadoOficial): PremioAposta | null {
  const regra = REGRAS_CONFERENCIA[resultado.modalidade];
  if (!regra || numeros.length < regra.k) return null;
  const a = premiarContra(numeros, resultado.dezenas, regra.k, resultado.rateios, 1, Boolean(regra.dupla));
  const faixas = [...a.faixas];
  if (regra.dupla && resultado.dezenas2) faixas.push(...premiarContra(numeros, resultado.dezenas2, regra.k, resultado.rateios, 2, true).faixas);
  return { numeros, acertos: a.acertos, faixas, total: centavos(faixas.reduce((s, f) => s + f.valor, 0)) };
}

export interface ConferenciaBolao {
  apostas: PremioAposta[];
  premioTotal: number;
  cotasTotal: number;
  cotasSobradas: number;
  /** Prêmio que fica com a lotérica (proporcional às cotas que sobraram). */
  premioLoterica: number;
  /** Prêmio por cota (para os clientes). */
  premioPorCota: number;
}

export function conferirBolao(jogos: number[][], resultado: ResultadoOficial, cotasTotal: number, cotasSobradas: number): ConferenciaBolao | null {
  if (!modalidadeConferivel(resultado.modalidade)) return null;
  const apostas = jogos.map((j) => premioDaAposta(j, resultado)).filter((x): x is PremioAposta => x !== null);
  const premioTotal = centavos(apostas.reduce((s, a) => s + a.total, 0));
  return {
    apostas,
    premioTotal,
    cotasTotal,
    cotasSobradas,
    premioLoterica: centavos((premioTotal / cotasTotal) * cotasSobradas),
    premioPorCota: centavos(premioTotal / cotasTotal),
  };
}

/** "Abriu rápido?": velocidade do 1º bolão na abertura (glossário: 21:46 rápido, 21:47 médio, 21:48+ lento). */
export type Velocidade = 'rapido' | 'medio' | 'lento';
export function velocidadeNaAbertura(atrasoS: number): Velocidade {
  if (atrasoS < 60) return 'rapido';
  if (atrasoS < 120) return 'medio';
  return 'lento';
}
