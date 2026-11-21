import { z } from 'zod';
import { mesDaSorte, semAcento, type ColunaLoteca } from '../dominio/jogo';
import type { ModalidadeSlug } from '../dominio/modalidades';
import { FormatoInesperadoError } from '../fonte/erros';
import { MODALIDADES_CAIXA } from '../fonte/adaptadores/caixa-bruto';

/**
 * Resultado e rateio OFICIAIS da CAIXA (API pública do portal de loterias:
 * https://servicebus2.caixa.gov.br/portaldeloterias/api/{modalidade}/{concurso}). Formato conferido
 * em 21/11/2026 com JSON real de Mega-Sena, Quina, Lotofácil, Dupla Sena, Lotomania, Timemania,
 * Dia de Sorte, +Milionária e Loteca (fixtures em fonte/fixtures/resultados/). O Super Sete devolveu
 * erro 500 da própria CAIXA nesse dia: o formato dele é presumido (fixture sintética).
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

/** O que a faixa premia, lido da descrição oficial. */
export type TipoFaixa =
  /** "4 acertos", "1º (14 acertos)" */
  | 'acertos'
  /** +Milionária: "5 acertos + 2 trevos", "5 acertos + 1 ou nenhum trevo", "3 acertos + 1 trevo" */
  | 'acertos-trevos'
  /** Timemania: "Time do Coração" */
  | 'time-coracao'
  /** Dia de Sorte: "Mês da Sorte" */
  | 'mes-sorte'
  | 'desconhecida';

export interface ClasseFaixa {
  tipo: TipoFaixa;
  acertos: number | null;
  /** Quantos trevos acertados valem a faixa (+Milionária). */
  trevos?: number[];
}

export function classificarFaixa(descricao: string): ClasseFaixa {
  const d = semAcento(descricao).toLowerCase();
  if (/time do coracao/.test(d)) return { tipo: 'time-coracao', acertos: null };
  if (/mes (da|de) sorte/.test(d)) return { tipo: 'mes-sorte', acertos: null };
  const m = /(\d+)\s*acerto/.exec(d);
  if (!m) return { tipo: 'desconhecida', acertos: null };
  const acertos = Number(m[1]);
  const t = /\+\s*(.*)trevo/.exec(d);
  if (!t) return { tipo: 'acertos', acertos };
  const trecho = t[1]!;
  const trevos = new Set<number>();
  for (const x of trecho.match(/\d+/g) ?? []) trevos.add(Number(x));
  if (/nenhum/.test(trecho)) trevos.add(0);
  return { tipo: 'acertos-trevos', acertos, trevos: [...trevos].sort((a, b) => a - b) };
}

export interface Rateio {
  faixa: number;
  descricao: string;
  /** Acertos da faixa ("4 acertos" -> 4); null se a descrição não traz número. */
  acertos: number | null;
  ganhadores: number;
  valorPremio: number;
}


export interface PartidaLoteca {
  jogo: number;
  time1: string;
  time2: string;
  gols1: number | null;
  gols2: number | null;
  /** Coluna vencedora (do placar ou, em jogo não realizado, do sorteio da CAIXA); null se ainda não há. */
  coluna: ColunaLoteca | null;
  /** A coluna saiu de sorteio (jogo adiado/cancelado). */
  sorteado: boolean;
}

export interface ResultadoOficial {
  modalidade: ModalidadeSlug;
  concurso: number;
  /** YYYY-MM-DD */
  dataApuracao: string;
  /** Dezenas sorteadas. No Super Sete, os 7 dígitos na ordem das colunas (1ª a 7ª). Na Loteca, vazio. */
  dezenas: number[];
  /** 2º sorteio (Dupla Sena). */
  dezenas2?: number[];
  /** Trevos sorteados (+Milionária). */
  trevos?: number[];
  /** Time do Coração sorteado (Timemania), como a CAIXA escreve ("CUIABA /MT"). */
  timeCoracao?: string;
  /** Mês da Sorte sorteado (Dia de Sorte), 1 a 12. */
  mesSorte?: number;
  /** Os 14 jogos da Loteca. */
  partidas?: PartidaLoteca[];
  rateios: Rateio[];
  acumulado: boolean;
}

/** Texto da CAIXA sem o preenchimento de bytes nulos que vem nas modalidades sem time/mês. */
function textoLimpo(s: string | null | undefined): string {
  return (s ?? '').replace(/\u0000/g, '').trim();
}

const dezena = z.union([z.string(), z.number()]);

const esquema = z
  .object({
    numero: z.number().int().positive(),
    tipoJogo: z.string(),
    dataApuracao: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
    listaDezenas: z.array(dezena).nullable().optional(),
    listaDezenasSegundoSorteio: z.array(dezena).nullable().optional(),
    dezenasSorteadasOrdemSorteio: z.array(dezena).nullable().optional(),
    trevosSorteados: z.array(dezena).nullable().optional(),
    nomeTimeCoracaoMesSorte: z.string().nullable().optional(),
    listaResultadoEquipeEsportiva: z
      .array(
        z
          .object({
            nuSequencial: z.number().int(),
            nomeEquipeUm: z.string(),
            nomeEquipeDois: z.string(),
            nuGolEquipeUm: z.number().int().nullable().optional(),
            nuGolEquipeDois: z.number().int().nullable().optional(),
            icSorteioResultado: z.union([z.number(), z.boolean()]).nullable().optional(),
            resultado: z.union([z.string(), z.number()]).nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
    listaRateioPremio: z.array(
      z.object({ descricaoFaixa: z.string(), faixa: z.number().int(), numeroDeGanhadores: z.number().int(), valorPremio: z.number() }).passthrough(),
    ),
    acumulado: z.boolean().optional(),
  })
  .passthrough();

/** Coluna de um resultado informado como texto ("1", "X", "EMPATE", "COLUNA 2", "MEIO"...). */
function colunaDoTexto(v: string | number): ColunaLoteca | null {
  const s = semAcento(String(v)).toUpperCase();
  if (/\b(X|EMPATE|MEIO)\b/.test(s)) return 'X';
  if (/\b1\b/.test(s)) return '1';
  if (/\b2\b/.test(s)) return '2';
  return null;
}

export function colunaDoPlacar(gols1: number, gols2: number): ColunaLoteca {
  return gols1 > gols2 ? '1' : gols1 < gols2 ? '2' : 'X';
}

export function normalizarResultadoCaixa(json: unknown): ResultadoOficial {
  const r = esquema.safeParse(json);
  if (!r.success) {
    throw new FormatoInesperadoError(`resultado da CAIXA fora do contrato: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const d = r.data;
  const modalidade = MODALIDADES_CAIXA[d.tipoJogo];
  if (!modalidade) throw new FormatoInesperadoError(`modalidade desconhecida no resultado: ${d.tipoJogo}`);
  const [dia, mes, ano] = d.dataApuracao.split('/');
  // Super Sete: um dígito por coluna; a ordem do sorteio é a das colunas (a lista ordenada a perderia)
  const fonteDezenas = modalidade === 'super-sete' && d.dezenasSorteadasOrdemSorteio?.length ? d.dezenasSorteadasOrdemSorteio : d.listaDezenas;
  const dezenas = (fonteDezenas ?? []).map(Number);
  if (modalidade !== 'loteca' && !dezenas.length) throw new FormatoInesperadoError(`resultado sem dezenas: ${d.tipoJogo} ${d.numero}`);
  if (dezenas.some((x) => !Number.isInteger(x))) throw new FormatoInesperadoError(`dezena não numérica: ${d.tipoJogo} ${d.numero}`);
  const out: ResultadoOficial = {
    modalidade,
    concurso: d.numero,
    dataApuracao: `${ano}-${mes}-${dia}`,
    dezenas,
    rateios: d.listaRateioPremio.map((x) => ({
      faixa: x.faixa,
      descricao: x.descricaoFaixa,
      acertos: classificarFaixa(x.descricaoFaixa).acertos,
      ganhadores: x.numeroDeGanhadores,
      valorPremio: x.valorPremio,
    })),
    acumulado: d.acumulado ?? false,
  };
  if (d.listaDezenasSegundoSorteio?.length) out.dezenas2 = d.listaDezenasSegundoSorteio.map(Number);
  if (d.trevosSorteados?.length) out.trevos = d.trevosSorteados.map(Number);
  const extra = textoLimpo(d.nomeTimeCoracaoMesSorte);
  if (extra && modalidade === 'timemania') out.timeCoracao = extra.replace(/\s+/g, ' ');
  if (extra && modalidade === 'dia-de-sorte') {
    const m = mesDaSorte(extra);
    if (m === null) throw new FormatoInesperadoError(`Mês da Sorte desconhecido: ${extra}`);
    out.mesSorte = m;
  }
  if (modalidade === 'loteca') {
    const jogos = d.listaResultadoEquipeEsportiva ?? [];
    if (!jogos.length) throw new FormatoInesperadoError(`Loteca ${d.numero} sem os jogos`);
    out.partidas = jogos
      .map((e) => {
        const gols1 = e.nuGolEquipeUm ?? null;
        const gols2 = e.nuGolEquipeDois ?? null;
        const sorteado = Boolean(e.icSorteioResultado);
        // jogo não realizado: vale a coluna sorteada (campo `resultado`); senão, o placar
        const informado = e.resultado !== null && e.resultado !== undefined && String(e.resultado).trim() ? colunaDoTexto(e.resultado) : null;
        const coluna = informado ?? (!sorteado && gols1 !== null && gols2 !== null ? colunaDoPlacar(gols1, gols2) : null);
        return { jogo: e.nuSequencial, time1: textoLimpo(e.nomeEquipeUm), time2: textoLimpo(e.nomeEquipeDois), gols1, gols2, coluna, sorteado };
      })
      .sort((a, b) => a.jogo - b.jogo);
  }
  return out;
}

/**
 * Cópia do JSON bruto que o PostgreSQL aceita em jsonb: a CAIXA preenche `nomeTimeCoracaoMesSorte`
 * com bytes nulos (\u0000) nas modalidades sem time/mês, e o jsonb recusa esse caractere.
 */
export function brutoParaGuardar(v: unknown): unknown {
  if (typeof v === 'string') return v.replace(/\u0000/g, '');
  if (Array.isArray(v)) return v.map(brutoParaGuardar);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, brutoParaGuardar(x)]));
  return v;
}
