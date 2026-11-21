import { combinacoes, type ModalidadeSlug } from '../dominio/modalidades';
import { centavos } from '../util/estatistica';
import { normalizarTime, type JogoBolao } from '../dominio/jogo';
import { classificarFaixa, type Rateio, type ResultadoOficial } from './resultado';

/**
 * Conferência de prêmios (Fase 3, "Conferência MKP"), todas as modalidades.
 *
 * Princípio: a aposta múltipla vale o mesmo que todas as apostas simples contidas nela. Então o
 * prêmio de uma faixa = (quantas apostas simples da aposta caem na faixa) x (valor do rateio oficial).
 *
 * - "Escolha k de N" (Mega, Quina, Lotofácil, Dupla Sena, Lotomania, Timemania, Dia de Sorte e os
 *   números da +Milionária): com n números e h acertos, as apostas simples com exatamente j acertos
 *   são C(h, j) x C(n − h, k − j). Ex.: Mega com 9 números que acerta 5 leva 4 quinas e 30 quadras.
 * - +Milionária: números x trevos; com t trevos e g acertados, C(g, i) x C(t − g, 2 − i) apostas
 *   simples acertam i trevos. A faixa diz quais i valem ("+ 1 ou nenhum trevo").
 * - Super Sete e Loteca: cada coluna/jogo marcado com m opções multiplica a aposta por m; as apostas
 *   simples com j acertos são o coeficiente de x^j em ∏ (acertou ? x + (m − 1) : m).
 * - Time do Coração (Timemania) e Mês da Sorte (Dia de Sorte): faixa à parte, paga a cada aposta
 *   simples com o time/mês sorteado (a confirmar no regulamento para o Dia de Sorte com mais de 7
 *   números; ver CLAUDE.md, questões em aberto).
 * - Dupla Sena: as faixas do 1º e do 2º sorteio vêm em sequência e com a MESMA descrição ("6 acertos");
 *   a 1ª ocorrência de cada número de acertos é do 1º sorteio, a repetição, do 2º.
 * - Lotomania: os números vão de 00 a 99 (o "00" também aparece como 100); faixa de 0 acertos.
 *
 * SPEC: seu prêmio (da lotérica) = prêmio total do bolão / cotas totais x cotas que SOBRARAM
 * (as cotas encalhadas ficam com a lotérica). Prêmios não entram no resultado financeiro.
 */
export type RegraConferencia =
  | {
      tipo: 'numeros';
      /** Números da aposta simples. */
      k: number;
      /** Máximo de números num jogo (volante oficial). */
      max: number;
      /** Universo dos números e quantos são sorteados. */
      de: number;
      ate: number;
      sorteadas: number;
      dupla?: boolean;
      especial?: 'time-coracao' | 'mes-sorte';
      /** +Milionária: trevos da aposta simples, máximo num jogo, universo e quantos são sorteados. */
      trevos?: { k: number; max: number; de: number; ate: number; sorteados: number };
    }
  | { tipo: 'colunas'; colunas: number; de: number; ate: number }
  | { tipo: 'loteca'; jogos: number };

/** Regras dos volantes, conferidas nas páginas oficiais da CAIXA em 21/11/2026. */
export const REGRAS_CONFERENCIA: Record<ModalidadeSlug, RegraConferencia> = {
  'mega-sena': { tipo: 'numeros', k: 6, max: 20, de: 1, ate: 60, sorteadas: 6 },
  quina: { tipo: 'numeros', k: 5, max: 15, de: 1, ate: 80, sorteadas: 5 },
  lotofacil: { tipo: 'numeros', k: 15, max: 20, de: 1, ate: 25, sorteadas: 15 },
  'dupla-sena': { tipo: 'numeros', k: 6, max: 15, de: 1, ate: 50, sorteadas: 6, dupla: true },
  lotomania: { tipo: 'numeros', k: 50, max: 50, de: 0, ate: 99, sorteadas: 20 },
  timemania: { tipo: 'numeros', k: 10, max: 10, de: 1, ate: 80, sorteadas: 7, especial: 'time-coracao' },
  'dia-de-sorte': { tipo: 'numeros', k: 7, max: 15, de: 1, ate: 31, sorteadas: 7, especial: 'mes-sorte' },
  'mais-milionaria': { tipo: 'numeros', k: 6, max: 12, de: 1, ate: 50, sorteadas: 6, trevos: { k: 2, max: 6, de: 1, ate: 6, sorteados: 2 } },
  // 7 números: 1 por coluna; 8 a 14: 1 ou 2 por coluna; 15 a 21: 2 ou 3 por coluna
  'super-sete': { tipo: 'colunas', colunas: 7, de: 0, ate: 9 },
  // cada jogo: 1, 2 (duplo) ou 3 (triplo) colunas
  loteca: { tipo: 'loteca', jogos: 14 },
};

/** Times do Coração da Timemania e meses do Dia de Sorte (probabilidade 1 em 80 e 1 em 12). */
export const TIMES_TIMEMANIA = 80;

export function modalidadeConferivel(m: ModalidadeSlug): boolean {
  return m in REGRAS_CONFERENCIA;
}


export interface PremioFaixa {
  sorteio: 1 | 2;
  faixa: number;
  descricao: string;
  /** Acertos da faixa (null em Time do Coração / Mês da Sorte). */
  acertos: number | null;
  /** Apostas simples premiadas na faixa. */
  quantidade: number;
  valorUnitario: number;
  valor: number;
}

export interface PremioAposta {
  numeros: number[];
  /** Acertos (no 1º sorteio na Dupla Sena; colunas no Super Sete; jogos na Loteca). */
  acertos: number;
  acertos2?: number;
  acertosTrevos?: number;
  acertouTime?: boolean;
  acertouMes?: boolean;
  /** Apostas simples contidas no jogo. */
  apostasSimples: number;
  faixas: PremioFaixa[];
  total: number;
  /** Faixas que não deu para conferir (ex.: o jogo veio sem o Time do Coração). */
  pendencias?: string[];
}

export type MotivoNaoConferido = string;

function paraJogo(j: number[] | JogoBolao): JogoBolao {
  return Array.isArray(j) ? { numeros: j } : j;
}

function distintosNoIntervalo(xs: number[], de: number, ate: number): boolean {
  return new Set(xs).size === xs.length && xs.every((x) => Number.isInteger(x) && x >= de && x <= ate);
}

/** Lotomania: "00" pode vir como 0 ou 100. */
function normalizarNumeros(m: ModalidadeSlug, xs: number[]): number[] {
  return m === 'lotomania' ? xs.map((x) => (x === 100 ? 0 : x)) : xs;
}

/** Sorteio (1 ou 2) de cada faixa da Dupla Sena: pela descrição, se disser; senão pela repetição. */
function sorteioPorFaixa(rateios: Rateio[]): Map<number, 1 | 2> {
  const out = new Map<number, 1 | 2>();
  const vistos = new Set<string>();
  for (const r of [...rateios].sort((a, b) => a.faixa - b.faixa)) {
    const d = r.descricao.toLowerCase();
    const explicito = /(1|primeiro)\s*[ºo°]?\s*sorteio/.test(d) ? 1 : /(2|segundo)\s*[ºo°]?\s*sorteio/.test(d) ? 2 : null;
    const chave = String(classificarFaixa(r.descricao).acertos ?? r.descricao);
    out.set(r.faixa, explicito ?? (vistos.has(chave) ? 2 : 1));
    vistos.add(chave);
  }
  return out;
}

/** Coeficientes de ∏ (acertou ? x + (m − 1) : m): quantas apostas simples acertam j colunas/jogos. */
export function distribuicaoDeAcertos(marcados: number[], acertou: boolean[]): number[] {
  let poli = [1];
  marcados.forEach((m, i) => {
    const a = acertou[i] ? 1 : 0;
    const prox = new Array<number>(poli.length + 1).fill(0);
    poli.forEach((c, j) => {
      prox[j] = prox[j]! + c * (m - a);
      prox[j + 1] = prox[j + 1]! + c * a;
    });
    poli = prox;
  });
  return poli;
}

function faixa(sorteio: 1 | 2, r: Rateio, quantidade: number, acertos: number | null): PremioFaixa {
  return { sorteio, faixa: r.faixa, descricao: r.descricao, acertos, quantidade, valorUnitario: r.valorPremio, valor: centavos(quantidade * r.valorPremio) };
}

function total(faixas: PremioFaixa[]): number {
  return centavos(faixas.reduce((s, f) => s + f.valor, 0));
}

/**
 * Prêmio de um jogo. Devolve `{ motivo }` quando não dá para conferir (jogo incompleto, resultado
 * sem o dado necessário) — nunca chuta um prêmio.
 */
export function conferirJogo(entrada: number[] | JogoBolao, resultado: ResultadoOficial): PremioAposta | { motivo: MotivoNaoConferido } {
  const regra = REGRAS_CONFERENCIA[resultado.modalidade];
  const jogo = paraJogo(entrada);
  if (regra.tipo === 'numeros') return conferirNumeros(regra, jogo, resultado);
  if (regra.tipo === 'colunas') return conferirSuperSete(regra, jogo, resultado);
  return conferirLoteca(regra, jogo, resultado);
}

function conferirNumeros(regra: Extract<RegraConferencia, { tipo: 'numeros' }>, jogo: JogoBolao, res: ResultadoOficial): PremioAposta | { motivo: string } {
  const numeros = normalizarNumeros(res.modalidade, jogo.numeros);
  const n = numeros.length;
  if (n < regra.k || n > regra.max || !distintosNoIntervalo(numeros, regra.de, regra.ate)) return { motivo: 'jogo com números inválidos' };
  const sorteadas1 = new Set(normalizarNumeros(res.modalidade, res.dezenas));
  const h1 = numeros.filter((x) => sorteadas1.has(x)).length;
  let h2: number | undefined;
  if (regra.dupla) {
    if (!res.dezenas2?.length) return { motivo: 'resultado sem o 2º sorteio' };
    const s2 = new Set(res.dezenas2);
    h2 = numeros.filter((x) => s2.has(x)).length;
  }
  // trevos (+Milionária): quantas apostas simples acertam i trevos
  let porTrevos: number[] | null = null;
  let g: number | undefined;
  if (regra.trevos) {
    const t = jogo.trevos ?? [];
    if (t.length < regra.trevos.k || t.length > regra.trevos.max || !distintosNoIntervalo(t, regra.trevos.de, regra.trevos.ate)) return { motivo: 'jogo sem os trevos' };
    if (!res.trevos?.length) return { motivo: 'resultado sem os trevos' };
    const st = new Set(res.trevos);
    g = t.filter((x) => st.has(x)).length;
    porTrevos = Array.from({ length: regra.trevos.k + 1 }, (_, i) => combinacoes(g!, i) * combinacoes(t.length - g!, regra.trevos!.k - i));
  }
  const apostasSimples = combinacoes(n, regra.k) * (porTrevos ? porTrevos.reduce((s, x) => s + x, 0) : 1);
  const sorteioDe = regra.dupla ? sorteioPorFaixa(res.rateios) : null;
  const faixas: PremioFaixa[] = [];
  let acertouTime: boolean | undefined;
  let acertouMes: boolean | undefined;
  const pendencias: string[] = [];
  for (const r of res.rateios) {
    const c = classificarFaixa(r.descricao);
    const sorteio = sorteioDe?.get(r.faixa) ?? 1;
    const h = sorteio === 2 ? h2! : h1;
    if (c.tipo === 'acertos' || c.tipo === 'acertos-trevos') {
      const j = c.acertos!;
      if (j > h) continue;
      let q = combinacoes(h, j) * combinacoes(n - h, regra.k - j);
      if (porTrevos) {
        // na +Milionária toda faixa diz os trevos; uma faixa sem trevos não premia aposta com trevos
        q *= (c.trevos ?? []).reduce((s, i) => s + (porTrevos![i] ?? 0), 0);
      }
      if (q > 0) faixas.push(faixa(sorteio, r, q, j));
    } else if (c.tipo === 'time-coracao' && regra.especial === 'time-coracao') {
      if (!jogo.timeCoracao || !res.timeCoracao) {
        pendencias.push(jogo.timeCoracao ? 'resultado sem o Time do Coração' : 'jogo sem o Time do Coração');
        continue;
      }
      acertouTime = normalizarTime(jogo.timeCoracao) === normalizarTime(res.timeCoracao);
      if (acertouTime) faixas.push(faixa(1, r, combinacoes(n, regra.k), null));
    } else if (c.tipo === 'mes-sorte' && regra.especial === 'mes-sorte') {
      if (!jogo.mesSorte || !res.mesSorte) {
        pendencias.push(jogo.mesSorte ? 'resultado sem o Mês da Sorte' : 'jogo sem o Mês da Sorte');
        continue;
      }
      acertouMes = jogo.mesSorte === res.mesSorte;
      if (acertouMes) faixas.push(faixa(1, r, combinacoes(n, regra.k), null));
    }
  }
  const out: PremioAposta = { numeros: jogo.numeros, acertos: h1, apostasSimples, faixas, total: total(faixas) };
  if (h2 !== undefined) out.acertos2 = h2;
  if (g !== undefined) out.acertosTrevos = g;
  if (acertouTime !== undefined) out.acertouTime = acertouTime;
  if (acertouMes !== undefined) out.acertouMes = acertouMes;
  if (pendencias.length) out.pendencias = pendencias;
  return out;
}

function conferirSuperSete(regra: Extract<RegraConferencia, { tipo: 'colunas' }>, jogo: JogoBolao, res: ResultadoOficial): PremioAposta | { motivo: string } {
  const cols = jogo.colunas;
  if (!cols || cols.length !== regra.colunas || cols.some((c) => !c.length || !distintosNoIntervalo(c, regra.de, regra.ate))) {
    return { motivo: 'jogo sem as 7 colunas' };
  }
  if (!colunasSuperSeteValidas(cols.map((c) => c.length))) return { motivo: 'jogo fora das regras do Super Sete' };
  if (res.dezenas.length !== regra.colunas) return { motivo: 'resultado sem as 7 colunas' };
  const acertou = cols.map((c, i) => c.includes(res.dezenas[i]!));
  return porDistribuicao(jogo, res, cols.map((c) => c.length), acertou);
}

/** Volante oficial: 7 números = 1 por coluna; 8 a 14 = 1 ou 2 por coluna; 15 a 21 = 2 ou 3 por coluna. */
export function colunasSuperSeteValidas(porColuna: number[]): boolean {
  if (porColuna.length !== 7) return false;
  const n = porColuna.reduce((s, x) => s + x, 0);
  if (n === 7) return porColuna.every((x) => x === 1);
  if (n >= 8 && n <= 14) return porColuna.every((x) => x >= 1 && x <= 2);
  if (n >= 15 && n <= 21) return porColuna.every((x) => x >= 2 && x <= 3);
  return false;
}

function conferirLoteca(regra: Extract<RegraConferencia, { tipo: 'loteca' }>, jogo: JogoBolao, res: ResultadoOficial): PremioAposta | { motivo: string } {
  const p = jogo.palpites;
  if (!p || p.length !== regra.jogos || p.some((x) => !x.length || x.length > 3 || new Set(x).size !== x.length || x.some((c) => c !== '1' && c !== 'X' && c !== '2'))) {
    return { motivo: 'jogo sem os 14 palpites' };
  }
  const partidas = [...(res.partidas ?? [])].sort((a, b) => a.jogo - b.jogo);
  if (partidas.length !== regra.jogos || partidas.some((x) => x.coluna === null)) return { motivo: 'resultado da Loteca incompleto' };
  const acertou = p.map((x, i) => x.includes(partidas[i]!.coluna!));
  return porDistribuicao(jogo, res, p.map((x) => x.length), acertou);
}

function porDistribuicao(jogo: JogoBolao, res: ResultadoOficial, marcados: number[], acertou: boolean[]): PremioAposta {
  const dist = distribuicaoDeAcertos(marcados, acertou);
  const faixas: PremioFaixa[] = [];
  for (const r of res.rateios) {
    const c = classificarFaixa(r.descricao);
    if (c.tipo !== 'acertos') continue;
    const q = dist[c.acertos!] ?? 0;
    if (q > 0) faixas.push(faixa(1, r, q, c.acertos));
  }
  return {
    numeros: jogo.numeros,
    acertos: acertou.filter(Boolean).length,
    apostasSimples: marcados.reduce((s, m) => s * m, 1),
    faixas,
    total: total(faixas),
  };
}

/** Compatível com a versão anterior: null quando o jogo não pode ser conferido. */
export function premioDaAposta(jogo: number[] | JogoBolao, resultado: ResultadoOficial): PremioAposta | null {
  const r = conferirJogo(jogo, resultado);
  return 'motivo' in r ? null : r;
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
  /** Jogos que não deu para conferir (e por quê). O prêmio acima não os inclui. */
  naoConferidos: { ordem: number; motivo: MotivoNaoConferido }[];
}

export function conferirBolao(jogos: (number[] | JogoBolao)[], resultado: ResultadoOficial, cotasTotal: number, cotasSobradas: number): ConferenciaBolao | null {
  if (!modalidadeConferivel(resultado.modalidade)) return null;
  const apostas: PremioAposta[] = [];
  const naoConferidos: ConferenciaBolao['naoConferidos'] = [];
  jogos.forEach((j, ordem) => {
    const r = conferirJogo(j, resultado);
    if ('motivo' in r) naoConferidos.push({ ordem, motivo: r.motivo });
    else apostas.push(r);
  });
  const premioTotal = centavos(apostas.reduce((s, a) => s + a.total, 0));
  return {
    apostas,
    premioTotal,
    cotasTotal,
    cotasSobradas,
    premioLoterica: centavos((premioTotal / cotasTotal) * cotasSobradas),
    premioPorCota: centavos(premioTotal / cotasTotal),
    naoConferidos,
  };
}

/** "Abriu rápido?": velocidade do 1º bolão na abertura (glossário: 21:46 rápido, 21:47 médio, 21:48+ lento). */
export type Velocidade = 'rapido' | 'medio' | 'lento';
export function velocidadeNaAbertura(atrasoS: number): Velocidade {
  if (atrasoS < 60) return 'rapido';
  if (atrasoS < 120) return 'medio';
  return 'lento';
}

const dois = (x: number) => String(x).padStart(2, '0');

/** O sorteio numa linha, com o que cada modalidade tem de próprio (para tela e planilha). */
export function resumoDoSorteio(r: ResultadoOficial): string {
  if (r.modalidade === 'loteca') return (r.partidas ?? []).map((p) => p.coluna ?? '?').join('');
  if (r.modalidade === 'super-sete') return r.dezenas.join('-');
  let s = r.dezenas.map(dois).join(' ');
  if (r.dezenas2?.length) s += ` | 2º: ${r.dezenas2.map(dois).join(' ')}`;
  if (r.trevos?.length) s += ` + trevos ${r.trevos.join(' ')}`;
  if (r.timeCoracao) s += ` · Time: ${r.timeCoracao}`;
  if (r.mesSorte) s += ` · Mês: ${MESES_EXIBICAO[r.mesSorte - 1]}`;
  return s;
}

const MESES_EXIBICAO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** "3× 4 acertos", "1× 2º sorteio: 5 acertos", "8× Mês da Sorte". */
export function rotuloFaixa(f: PremioFaixa, dupla = false): string {
  return `${f.quantidade}× ${dupla ? `${f.sorteio}º sorteio: ` : ''}${f.descricao}`;
}
