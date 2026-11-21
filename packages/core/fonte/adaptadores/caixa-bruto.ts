import { z } from 'zod';
import type { ModalidadeSlug } from '../../dominio/modalidades';
import { normalizarCodigoLoterica } from '../../dominio/loterica';
import { mesDaSorte, type ColunaLoteca, type JogoBolao } from '../../dominio/jogo';
import { horarioSP, noDiaSP } from '../../tempo/fuso';
import { FormatoInesperadoError } from '../erros';
import type { BolaoFonte, ConcursoAbertoFonte, ConsultaBoloes, PaginaBoloes } from '../tipos';

/**
 * Formato BRUTO do Marketplace (Loterias Online, `silce-servico-rest`), como observado no portal
 * em 21/11/2026 (ver docs/fonte-caixa.md). Aqui só se lê JSON de RESPOSTA: o parâmetro `q` das
 * requisições é cifrado pelo próprio site e não é reproduzido nem decifrado por este sistema.
 *
 * Campos usados pelo normalizador (semântica conhecida): codigoBolao, index, loterica,
 * nomeFantasia, nomeRazaoSocial, uf.sigla, municipio.nome, concurso, modalidade, dataSorteio,
 * qtdApostas, qtdNumeros, qtdTrevos, qtdCotaTotal, qtdCotaDigital, qtdCotaDisponivel,
 * vrCotaSemTarifa, vrCotaComTarifa, valorTarifaServico, contemResiduo, vrUltimaCotaSemTarifa,
 * vrPremioEstimado. Os demais passam adiante sem validação de conteúdo.
 */

/** Caminhos da API (o portal manda o caminho em base64 na URL). */
export const CAMINHOS_CAIXA = {
  parametrosBolao: 'parametros/bolao-caixa',
  recuperarDados: 'usuarios/recuperar-dados',
  boloesDisponiveis: 'boloes/recuperar-boloes-disponiveis',
  boloesDisponiveisLink: 'boloes/recuperar-boloes-disponiveis-link',
  detalharBolao: 'boloes/detalhar-bolao',
} as const;

/** Extrai o caminho da API de uma URL `.../silce-servico-rest/rest/v1/{base64}/...`. */
export function caminhoDaUrlCaixa(url: string): string | null {
  const m = /silce-servico-rest\/rest\/v1\/([A-Za-z0-9+/=_-]+)/.exec(url);
  if (!m) return null;
  try {
    const txt = Buffer.from(m[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return /^[\x20-\x7e]+$/.test(txt) ? txt.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

/** Nome da modalidade na CAIXA -> slug interno. Na vitrine só MEGA_SENA foi observado; na API de resultados (21/11/2026) os 9 nomes abaixo, menos SUPER_SETE, apareceram iguais. */
export const MODALIDADES_CAIXA: Record<string, ModalidadeSlug> = {
  MEGA_SENA: 'mega-sena',
  LOTOFACIL: 'lotofacil',
  QUINA: 'quina',
  LOTOMANIA: 'lotomania',
  DUPLA_SENA: 'dupla-sena',
  TIMEMANIA: 'timemania',
  DIA_DE_SORTE: 'dia-de-sorte',
  SUPER_SETE: 'super-sete',
  MAIS_MILIONARIA: 'mais-milionaria',
  LOTECA: 'loteca',
};

export const MODALIDADE_PARA_CAIXA: Record<ModalidadeSlug, string> = Object.fromEntries(
  Object.entries(MODALIDADES_CAIXA).map(([k, v]) => [v, k]),
) as Record<ModalidadeSlug, string>;

const numero = z.number().finite();
const inteiro = z.number().int();

export const esquemaItemBolaoCaixa = z
  .object({
    index: inteiro.positive().optional().nullable(),
    codigoBolao: z.string().min(1),
    qtdCotaDigital: inteiro.nonnegative().optional().nullable(),
    qtdCotaTotal: inteiro.positive(),
    qtdCotaDisponivel: inteiro.nonnegative(),
    loterica: z.union([inteiro.nonnegative(), z.string().regex(/^\d+$/)]),
    nomeFantasia: z.string().optional().nullable(),
    nomeRazaoSocial: z.string().optional().nullable(),
    uf: z.object({ sigla: z.string().regex(/^[A-Za-z]{2}$/) }).passthrough(),
    municipio: z.object({ nome: z.string().min(1) }).passthrough(),
    concurso: inteiro.positive(),
    modalidade: z.string().min(1),
    dataSorteio: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/).optional().nullable(),
    horaSorteio: z.string().optional().nullable(),
    vrPremioEstimado: numero.optional().nullable(),
    vrCotaSemTarifa: numero.positive(),
    vrCotaComTarifa: numero.positive().optional().nullable(),
    valorTarifaServico: numero.nonnegative().optional().nullable(),
    vrUltimaCotaSemTarifa: numero.positive().optional().nullable(),
    contemResiduo: z.boolean().optional().nullable(),
    qtdApostas: inteiro.positive(),
    qtdNumeros: inteiro.nonnegative(),
    qtdTrevos: inteiro.nonnegative().optional().nullable(),
  })
  .passthrough()
  .refine((b) => b.qtdCotaDisponivel <= b.qtdCotaTotal, { message: 'qtdCotaDisponivel > qtdCotaTotal' });

export type ItemBolaoCaixa = z.infer<typeof esquemaItemBolaoCaixa>;

export const esquemaRespostaBoloesCaixa = z
  .object({
    versao: z.string().optional(),
    dataHoraServidor: z.string().optional(),
    payload: z
      .object({
        totalRegistros: inteiro.nonnegative(),
        paginaAtual: inteiro.positive(),
        ultimaPagina: z.union([inteiro.nonnegative(), z.boolean()]).optional().nullable(),
        valorMenorCota: numero.optional().nullable(),
        contemResiduo: z.boolean().optional().nullable(),
        cotas: z.array(z.unknown()),
      })
      .passthrough(),
  })
  .passthrough();

function falha(msg: string, issues?: unknown): never {
  throw new FormatoInesperadoError(`resposta da CAIXA fora do contrato: ${msg}`, issues);
}

function resumo(e: z.ZodError): string {
  return e.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
    .join('; ');
}

/** "22/11/2026" -> "2026-11-22". */
export function lerDataSorteioCaixa(d: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
  if (!m) falha(`dataSorteio inválida: ${d}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** dataHoraServidor vem no horário de São Paulo, sem fuso: "2026-11-21T01:18:30.949". */
export function lerDataHoraServidorCaixa(s: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) return undefined;
  const ms = m[7] ? Number(m[7].padEnd(3, '0')) : 0;
  return horarioSP(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), ms);
}

/**
 * codigoBolao é base64 de "ano;mês;número;lote;". Ex.: "MjAyNjsxMTs2MzAyOTE2MDI7MTA3OTU7" ->
 * { ano: 2026, mes: 11, numero: 630291602, lote: 10795 }. O código cru é o id estável.
 */
export function decodificarCodigoBolao(codigo: string): { ano: number; mes: number; numero: number; lote: number } | null {
  try {
    const txt = Buffer.from(codigo, 'base64').toString('utf8');
    const m = /^(\d{4});(\d{1,2});(\d+);(\d+);?$/.exec(txt);
    if (!m) return null;
    return { ano: Number(m[1]), mes: Number(m[2]), numero: Number(m[3]), lote: Number(m[4]) };
  } catch {
    return null;
  }
}

/** Converte UM item de `payload.cotas` para o formato normalizado. Lança FormatoInesperadoError. */
export function normalizarBolao(bruto: unknown): BolaoFonte {
  const r = esquemaItemBolaoCaixa.safeParse(bruto);
  if (!r.success) falha(resumo(r.error), r.error.issues);
  const b = r.data;
  const modalidade = MODALIDADES_CAIXA[b.modalidade];
  if (!modalidade) falha(`modalidade desconhecida: ${b.modalidade}`);
  const nome = (b.nomeFantasia ?? '').trim() || (b.nomeRazaoSocial ?? '').trim();
  if (!nome) falha(`bolão ${b.codigoBolao} sem nome de lotérica`);
  if (b.qtdCotaDigital !== undefined && b.qtdCotaDigital !== null && b.qtdCotaDigital > b.qtdCotaTotal) {
    falha(`bolão ${b.codigoBolao}: qtdCotaDigital > qtdCotaTotal`);
  }

  const out: BolaoFonte = {
    idCaixa: b.codigoBolao,
    loterica: {
      codigoCaixa: normalizarCodigoLoterica(b.loterica) ?? String(b.loterica),
      nome,
      cidade: b.municipio.nome.trim(),
      uf: b.uf.sigla.toUpperCase(),
    },
    modalidade,
    concurso: b.concurso,
    jogos: b.qtdApostas,
    dezenas: b.qtdNumeros,
    cotasTotal: b.qtdCotaTotal,
    cotasDisponiveis: b.qtdCotaDisponivel,
    valorCotaBase: b.vrCotaSemTarifa,
  };
  if (b.vrCotaComTarifa) out.valorCotaExibido = b.vrCotaComTarifa;
  if (b.index) out.filaFonte = b.index;
  if (b.qtdCotaDigital !== undefined && b.qtdCotaDigital !== null) out.cotasDigitais = b.qtdCotaDigital;
  if (b.contemResiduo) {
    out.contemResiduo = true;
    if (b.vrUltimaCotaSemTarifa) out.valorUltimaCotaBase = b.vrUltimaCotaSemTarifa;
  }
  if (b.valorTarifaServico !== undefined && b.valorTarifaServico !== null) out.tarifaPorCotaFonte = b.valorTarifaServico;
  if (b.qtdTrevos) out.trevos = b.qtdTrevos;
  return out;
}

export interface OpcoesNormalizacaoPagina {
  obtidaEm: Date;
  /**
   * A lista do portal é personalizada pela cidade do comprador (cidade -> UF -> Brasil). Enquanto a
   * semântica de escopo não for confirmada, a ordem NÃO é tratada como a ordem da vitrine Brasil
   * (default false): a colocação vem da regra (fila + first_seen_at).
   */
  confiarOrdemDaFonte?: boolean;
  tamanhoPagina?: number;
}

/**
 * Converte a resposta de `recuperar-boloes-disponiveis` numa PaginaBoloes. Itens de outro
 * concurso/modalidade (a lista é por modalidade) são descartados.
 */
export function normalizarPaginaCaixa(json: unknown, consulta: ConsultaBoloes, o: OpcoesNormalizacaoPagina): PaginaBoloes {
  const r = esquemaRespostaBoloesCaixa.safeParse(json);
  if (!r.success) falha(resumo(r.error), r.error.issues);
  const p = r.data.payload;
  const itens = p.cotas.map(normalizarBolao).filter((b) => b.modalidade === consulta.modalidade && b.concurso === consulta.concurso);
  const tamanho = o.tamanhoPagina ?? 30;
  const totalPaginas =
    typeof p.ultimaPagina === 'number' && p.ultimaPagina > 0 ? p.ultimaPagina : Math.ceil(p.totalRegistros / tamanho);
  const pagina: PaginaBoloes = {
    consulta,
    pagina: p.paginaAtual,
    tamanhoPagina: tamanho,
    totalItens: p.totalRegistros,
    totalPaginas,
    itens,
    ordemDaVitrine: o.confiarOrdemDaFonte ?? false,
    obtidaEm: o.obtidaEm,
  };
  const hs = r.data.dataHoraServidor ? lerDataHoraServidorCaixa(r.data.dataHoraServidor) : undefined;
  if (hs) pagina.horaServidor = hs;
  return pagina;
}

/** Concursos presentes numa resposta (para `concursosAbertos`). */
export function concursosNaRespostaCaixa(json: unknown): ConcursoAbertoFonte[] {
  const r = esquemaRespostaBoloesCaixa.safeParse(json);
  if (!r.success) falha(resumo(r.error), r.error.issues);
  const vistos = new Map<string, ConcursoAbertoFonte>();
  for (const bruto of r.data.payload.cotas) {
    const it = esquemaItemBolaoCaixa.safeParse(bruto);
    if (!it.success) continue;
    const modalidade = MODALIDADES_CAIXA[it.data.modalidade];
    if (!modalidade) continue;
    const k = `${modalidade}#${it.data.concurso}`;
    if (vistos.has(k)) continue;
    const c: ConcursoAbertoFonte = { modalidade, concurso: it.data.concurso };
    if (it.data.dataSorteio) {
      c.dataSorteio = lerDataSorteioCaixa(it.data.dataSorteio);
      const h = /^(\d{1,2})[:hH](\d{2})/.exec(it.data.horaSorteio ?? '');
      if (h) c.sorteioEm = noDiaSP(c.dataSorteio, Number(h[1]), Number(h[2]));
    }
    if (it.data.vrPremioEstimado) c.premioEstimado = it.data.vrPremioEstimado;
    vistos.set(k, c);
  }
  return [...vistos.values()];
}

/**
 * `detalhar-bolao`: mesmos campos + `apostas` (os jogos). O formato exato de `apostas` ainda não
 * foi confirmado; aceita lista de listas de números, de objetos com numeros/dezenas, ou texto.
 */
export function normalizarDetalheBolaoCaixa(json: unknown): BolaoFonte {
  const env = z.object({ payload: z.unknown() }).passthrough().safeParse(json);
  const bruto = env.success && env.data.payload && typeof env.data.payload === 'object' ? env.data.payload : json;
  const b = normalizarBolao(bruto);
  const apostas = (bruto as { apostas?: unknown }).apostas;
  const numeros = lerApostas(apostas);
  if (numeros && numeros.length === b.jogos) b.numeros = numeros;
  const detalhe = lerJogosDetalhe(apostas, b.modalidade);
  if (detalhe && detalhe.length === b.jogos) b.jogosDetalhe = detalhe;
  return b;
}

/** Modalidades cujo prêmio depende de algo além dos números do jogo. */
const COM_MARCACOES_EXTRAS: ReadonlySet<ModalidadeSlug> = new Set(['timemania', 'dia-de-sorte', 'mais-milionaria', 'super-sete', 'loteca']);

function campo(o: Record<string, unknown>, nomes: string[]): unknown {
  for (const n of nomes) if (o[n] !== undefined && o[n] !== null && o[n] !== '') return o[n];
  return undefined;
}

/** "1X" / ["1","X"] / "COLUNA 1" / 0|1|2 (0 = meio) -> palpites de um jogo da Loteca. */
function lerPalpite(v: unknown): ColunaLoteca[] | null {
  const itens = Array.isArray(v) ? v : typeof v === 'string' ? v.toUpperCase().replace(/[^12X]/g, '').split('') : null;
  if (!itens?.length) return null;
  const out = new Set<ColunaLoteca>();
  for (const x of itens) {
    const s = String(x).toUpperCase().trim();
    const c = s === '1' ? '1' : s === '2' ? '2' : s === 'X' || s === '0' || /EMPATE|MEIO/.test(s) ? 'X' : null;
    if (!c) return null;
    out.add(c);
  }
  return [...out];
}

/**
 * Jogos com as marcações extras (formato da CAIXA ainda NÃO confirmado: aceita os nomes de campo
 * prováveis e só devolve algo quando a modalidade precisa e o jogo trouxe a marcação).
 */
function lerJogosDetalhe(apostas: unknown, modalidade: ModalidadeSlug): JogoBolao[] | null {
  if (!COM_MARCACOES_EXTRAS.has(modalidade) || !Array.isArray(apostas)) return null;
  const jogos: JogoBolao[] = [];
  for (const a of apostas) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
    const o = a as Record<string, unknown>;
    const j: JogoBolao = { numeros: modalidade === 'super-sete' || modalidade === 'loteca' ? [] : (lerNumeros(o) ?? []) };
    if (modalidade === 'mais-milionaria') {
      const t = lerNumeros(campo(o, ['trevos', 'listaTrevos', 'trevosApostados']));
      if (t) j.trevos = t;
    }
    if (modalidade === 'timemania') {
      const t = campo(o, ['timeCoracao', 'nomeTimeCoracao', 'timeDoCoracao', 'time']);
      if (typeof t === 'string' && t.trim()) j.timeCoracao = t.trim();
    }
    if (modalidade === 'dia-de-sorte') {
      const m = mesDaSorte(campo(o, ['mesSorte', 'mesDaSorte', 'mesDeSorte', 'mes']) as string | number | undefined);
      if (m) j.mesSorte = m;
    }
    if (modalidade === 'super-sete') {
      const c = campo(o, ['colunas', 'numerosPorColuna']);
      if (Array.isArray(c)) {
        const cols = c.map(lerNumeros);
        if (cols.every((x): x is number[] => x !== null)) j.colunas = cols;
      }
    }
    if (modalidade === 'loteca') {
      const p = campo(o, ['palpites', 'prognosticos', 'jogos']);
      if (Array.isArray(p)) {
        const ps = p.map((x) => lerPalpite(x && typeof x === 'object' && !Array.isArray(x) ? campo(x as Record<string, unknown>, ['palpite', 'prognostico', 'colunas']) : x));
        if (ps.every((x): x is ColunaLoteca[] => x !== null)) j.palpites = ps;
      }
    }
    const temExtra = j.trevos || j.timeCoracao || j.mesSorte || j.colunas || j.palpites;
    if (!temExtra) return null;
    jogos.push(j);
  }
  return jogos.length ? jogos : null;
}

function lerNumeros(v: unknown): number[] | null {
  if (Array.isArray(v) && v.every((x) => Number.isInteger(Number(x)))) return v.map(Number);
  if (typeof v === 'string') {
    const partes = v.split(/[^\d]+/).filter(Boolean).map(Number);
    return partes.length ? partes : null;
  }
  if (v && typeof v === 'object') {
    for (const k of ['numeros', 'dezenas', 'numerosApostados', 'prognosticos']) {
      const r = lerNumeros((v as Record<string, unknown>)[k]);
      if (r) return r;
    }
  }
  return null;
}

function lerApostas(apostas: unknown): number[][] | null {
  if (!Array.isArray(apostas)) return null;
  const r = apostas.map(lerNumeros);
  return r.every((x): x is number[] => x !== null) ? r : null;
}
