import {
  chanceDoBolao,
  criarAleatorio,
  diaSP,
  disponiveisEm,
  formatarCodigoBolao,
  linkCaixaLoterica,
  metricasDoSite,
  normalizarCodigoLoterica,
  normalizarWhatsapp,
  slugDoNome,
  slugValido,
  somarDias,
  valorCotaComTarifa,
  type BolaoDoSite,
  type ChanceBolao,
  type EventoSite,
  type LotericaRef,
  type ModalidadeSlug,
  type TipoEventoSite,
} from '@radar/core';
import type { FonteDadosRaioX } from './dados';
import type { FontePostgresRaioX } from './dados-postgres';
import { NOME_MODALIDADE } from './formato';
import { fonteMercado } from './mercado';

/**
 * Site público da lotérica (/{slug}). Configuração, em ordem de prioridade: tabela `sites` (banco),
 * variável RADAR_SITES (JSON) e, para as lotéricas do dono, um padrão com o slug do nome.
 * Métricas: tabela `site_eventos` (ou memória, na simulação); sem dado pessoal.
 */
export type TemaSite = 'classico' | 'noite' | 'sorte';
export const TEMAS: TemaSite[] = ['classico', 'noite', 'sorte'];

export interface ConfigSite {
  slug: string;
  loterica: LotericaRef;
  whatsapp: string | null;
  instagram: string | null;
  endereco: string | null;
  horario: string | null;
  sobre: string | null;
  tema: TemaSite;
  linkCaixa: string;
  origem: 'banco' | 'configuracao' | 'padrao';
  siteId: number | null;
}

export interface BolaoPublico extends BolaoDoSite {
  formato: string;
  nomeModalidade: string;
  /** Valor que o cliente paga por cota (com tarifa). */
  valorCota: number;
  jogosNumeros: number[][] | null;
  /** Números de demonstração (simulação), não são os jogos reais. */
  jogosDemonstracao: boolean;
  chance: ChanceBolao;
}

interface SiteEnv {
  codigo: string;
  slug?: string;
  whatsapp?: string;
  instagram?: string;
  endereco?: string;
  horario?: string;
  sobre?: string;
  tema?: string;
  linkCaixa?: string;
}

function lerSitesEnv(): SiteEnv[] {
  try {
    const v = JSON.parse(process.env.RADAR_SITES ?? '[]') as unknown;
    return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object' && 'codigo' in x) as SiteEnv[]) : [];
  } catch {
    return [];
  }
}

const tema = (t: string | null | undefined): TemaSite => (t === 'noite' || t === 'sorte' ? t : 'classico');
const sql = (fonte: FonteDadosRaioX) => (fonte.tipo === 'postgres' ? (fonte as FontePostgresRaioX).sql : null);

/** Todos os sites conhecidos (banco + RADAR_SITES + padrão das lotéricas do dono). */
export async function sitesConhecidos(fonte: FonteDadosRaioX): Promise<ConfigSite[]> {
  const out = new Map<string, ConfigSite>();
  const porCodigo = new Map<string, ConfigSite>();
  const s = sql(fonte);
  if (s) {
    const rs = await s<{ id: string; slug: string; whatsapp: string | null; instagram: string | null; endereco: string | null; horario: string | null; sobre: string | null; tema: string; link_caixa: string | null; codigo_caixa: string; nome: string; cidade: string; uf: string; bairro: string | null }[]>`
      select s.id::text, s.slug, s.whatsapp, s.instagram, s.endereco, s.horario, s.sobre, s.tema, s.link_caixa, l.codigo_caixa, l.nome, l.cidade, l.uf, l.bairro
      from sites s join lotericas l on l.id = s.loterica_id where s.ativo`;
    for (const r of rs) {
      const loterica: LotericaRef = { codigoCaixa: r.codigo_caixa, nome: r.nome, cidade: r.cidade, uf: r.uf, ...(r.bairro ? { bairro: r.bairro } : {}) };
      const c: ConfigSite = { slug: r.slug, loterica, whatsapp: r.whatsapp, instagram: r.instagram, endereco: r.endereco, horario: r.horario, sobre: r.sobre, tema: tema(r.tema), linkCaixa: linkCaixaLoterica(r.codigo_caixa, r.link_caixa), origem: 'banco', siteId: Number(r.id) };
      out.set(c.slug, c);
      porCodigo.set(r.codigo_caixa, c);
    }
  }
  const minhas = await fonte.minhasLotericas().catch(() => []);
  const ref = async (codigo: string) => minhas.find((m) => m.codigoCaixa === codigo) ?? (await fonte.loterica(codigo));
  for (const e of lerSitesEnv()) {
    const codigo = normalizarCodigoLoterica(e.codigo) ?? e.codigo;
    if (porCodigo.has(codigo)) continue;
    const l = await ref(codigo);
    if (!l) continue;
    const slug = e.slug && slugValido(e.slug) ? e.slug : slugDoNome(l.nome);
    const c: ConfigSite = { slug, loterica: l, whatsapp: normalizarWhatsapp(e.whatsapp), instagram: e.instagram?.replace(/^@/, '') ?? null, endereco: e.endereco ?? null, horario: e.horario ?? null, sobre: e.sobre ?? null, tema: tema(e.tema), linkCaixa: linkCaixaLoterica(codigo, e.linkCaixa), origem: 'configuracao', siteId: null };
    out.set(slug, c);
    porCodigo.set(codigo, c);
  }
  for (const l of minhas) {
    if (porCodigo.has(l.codigoCaixa)) continue;
    const slug = slugDoNome(l.nome);
    if (!slugValido(slug) || out.has(slug)) continue;
    out.set(slug, { slug, loterica: l, whatsapp: null, instagram: null, endereco: null, horario: null, sobre: null, tema: 'classico', linkCaixa: linkCaixaLoterica(l.codigoCaixa), origem: 'padrao', siteId: null });
  }
  return [...out.values()];
}

export async function siteDoSlug(fonte: FonteDadosRaioX, slug: string): Promise<ConfigSite | null> {
  if (!slugValido(slug)) return null;
  return (await sitesConhecidos(fonte)).find((s) => s.slug === slug) ?? null;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const UNIVERSO: Partial<Record<ModalidadeSlug, number>> = { 'mega-sena': 60, lotofacil: 25, quina: 80, 'dupla-sena': 50, 'dia-de-sorte': 31, 'mais-milionaria': 50 };

/** Jogos de DEMONSTRAÇÃO (simulação): determinísticos pelo id do bolão. */
function jogosDeDemonstracao(id: string, modalidade: ModalidadeSlug, jogos: number, dezenas: number): number[][] | null {
  const n = UNIVERSO[modalidade];
  if (!n || dezenas > n) return null;
  const r = criarAleatorio(hash(id));
  return Array.from({ length: jogos }, () => {
    const s = new Set<number>();
    while (s.size < dezenas) s.add(r.inteiro(1, n));
    return [...s].sort((a, b) => a - b);
  });
}

function publico(b: BolaoDoSite, jogos: number[][] | null, demo: boolean): BolaoPublico {
  return {
    ...b,
    formato: formatarCodigoBolao({ jogos: b.jogos, dezenas: b.dezenas, cotas: b.cotasTotal }),
    nomeModalidade: NOME_MODALIDADE[b.modalidade] ?? b.modalidade,
    valorCota: valorCotaComTarifa(b.valorCotaBase),
    jogosNumeros: jogos,
    jogosDemonstracao: demo && jogos !== null,
    chance: chanceDoBolao(b.modalidade, b.jogos, b.dezenas),
  };
}

/** Bolões à venda agora da lotérica do site. */
export async function boloesDoSite(fonte: FonteDadosRaioX, site: ConfigSite): Promise<BolaoPublico[]> {
  const s = sql(fonte);
  const agora = fonte.agora();
  if (s) {
    const rs = await s<{ id: string; slug: string; numero: number; jogos: number; dezenas: number; cotas_total: number; cotas_disponiveis: number; valor_cota: string; fecha_em: Date | string | null }[]>`
      select b.id::text, m.slug, c.numero, b.jogos, b.dezenas, b.cotas_total, b.cotas_disponiveis, b.valor_cota, c.fecha_em
      from boloes b join lotericas l on l.id = b.loterica_id join concursos c on c.id = b.concurso_id join modalidades m on m.id = c.modalidade_id
      where l.codigo_caixa = ${site.loterica.codigoCaixa} and b.status = 'a_venda' and not b.estornado and b.cotas_disponiveis > 0
        and (c.fecha_em is null or c.fecha_em > ${agora.toISOString()}::timestamptz)
      order by c.fecha_em nulls last, b.first_seen_at`;
    const jogos = rs.length ? await s<{ bolao_id: string; numeros: number[] }[]>`select bolao_id::text, numeros from bolao_jogos where bolao_id = any(${rs.map((r) => r.id)}::bigint[]) order by bolao_id, ordem` : [];
    const porBolao = new Map<string, number[][]>();
    for (const j of jogos) porBolao.set(j.bolao_id, [...(porBolao.get(j.bolao_id) ?? []), j.numeros]);
    return rs.map((r) =>
      publico(
        { id: r.id, modalidade: r.slug as ModalidadeSlug, concurso: r.numero, jogos: r.jogos, dezenas: r.dezenas, cotasTotal: r.cotas_total, disponiveis: r.cotas_disponiveis, valorCotaBase: Number(r.valor_cota), fechaEm: r.fecha_em === null ? null : new Date(r.fecha_em) },
        porBolao.get(r.id) ?? null,
        false,
      ),
    );
  }
  const m = fonteMercado(fonte);
  const out: BolaoPublico[] = [];
  for (const c of await m.concursosAVenda(agora)) {
    if (c.fechaEm && c.fechaEm.getTime() <= agora.getTime()) continue;
    for (const b of await m.boloes(c.chave, agora)) {
      if (b.loterica.codigoCaixa !== site.loterica.codigoCaixa) continue;
      const d = disponiveisEm(b, agora.getTime()) ?? 0;
      if (d <= 0) continue;
      const base: BolaoDoSite = { id: b.id, modalidade: b.modalidade, concurso: b.concurso, jogos: b.jogos, dezenas: b.dezenas, cotasTotal: b.cotasTotal, disponiveis: d, valorCotaBase: b.valorCotaBase, fechaEm: c.fechaEm };
      out.push(publico(base, jogosDeDemonstracao(b.id, b.modalidade, b.jogos, b.dezenas), true));
    }
  }
  return out;
}

const EVENTOS_MEMORIA = new Map<string, EventoSite[]>();

export async function registrarEvento(fonte: FonteDadosRaioX, site: ConfigSite, e: { tipo: TipoEventoSite; visitante: string; bolaoId?: string | null }): Promise<void> {
  const visitante = e.visitante.slice(0, 64);
  const s = sql(fonte);
  if (s && site.siteId !== null) {
    await s`insert into site_eventos (site_id, tipo, visitante, bolao_id) values (${site.siteId}, ${e.tipo}, ${visitante}, ${e.bolaoId ?? null})`;
    return;
  }
  const lista = EVENTOS_MEMORIA.get(site.slug) ?? [];
  lista.push({ em: fonte.agora(), tipo: e.tipo, visitante });
  if (lista.length > 50_000) lista.splice(0, lista.length - 50_000);
  EVENTOS_MEMORIA.set(site.slug, lista);
}

export async function metricasDoSiteNoPeriodo(fonte: FonteDadosRaioX, site: ConfigSite, dias = 30) {
  const agora = fonte.agora();
  const de = somarDias(diaSP(agora), -(dias - 1));
  const s = sql(fonte);
  let eventos: EventoSite[];
  if (s && site.siteId !== null) {
    const rs = await s<{ em: Date | string; tipo: TipoEventoSite; visitante: string }[]>`
      select em, tipo, visitante from site_eventos where site_id = ${site.siteId} and em >= ${new Date(`${de}T03:00:00Z`).toISOString()}::timestamptz`;
    eventos = rs.map((r) => ({ em: new Date(r.em), tipo: r.tipo, visitante: r.visitante }));
  } else {
    eventos = (EVENTOS_MEMORIA.get(site.slug) ?? []).filter((e) => diaSP(e.em) >= de);
  }
  return { de, ...metricasDoSite(eventos) };
}

export interface DadosSite {
  whatsapp?: string | null;
  instagram?: string | null;
  endereco?: string | null;
  horario?: string | null;
  sobre?: string | null;
  tema?: string | null;
  slug?: string | null;
}

/** Grava (cria ou atualiza) o site de uma lotérica do dono no banco. */
export async function salvarSite(fonte: FonteDadosRaioX, codigo: string, d: DadosSite): Promise<ConfigSite> {
  const s = sql(fonte);
  if (!s) throw new Error('editar o site precisa do banco (DATABASE_URL)');
  const atual = (await sitesConhecidos(fonte)).find((x) => x.loterica.codigoCaixa === codigo);
  const slug = d.slug && slugValido(d.slug) ? d.slug : (atual?.slug ?? slugDoNome(codigo));
  const [l] = await s<{ id: string }[]>`select id::text from lotericas where codigo_caixa = ${codigo}`;
  if (!l) throw new Error(`lotérica ${codigo} ainda não está no banco`);
  await s`
    insert into sites (loterica_id, slug, whatsapp, instagram, endereco, horario, sobre, tema)
    values (${l.id}::bigint, ${slug}, ${normalizarWhatsapp(d.whatsapp)}, ${d.instagram?.replace(/^@/, '') || null}, ${d.endereco || null}, ${d.horario || null}, ${d.sobre || null}, ${tema(d.tema)})
    on conflict (loterica_id) do update set slug = excluded.slug, whatsapp = excluded.whatsapp, instagram = excluded.instagram, endereco = excluded.endereco,
      horario = excluded.horario, sobre = excluded.sobre, tema = excluded.tema, atualizado_em = now()`;
  return (await sitesConhecidos(fonte)).find((x) => x.loterica.codigoCaixa === codigo)!;
}
