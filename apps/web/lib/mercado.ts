import {
  backtestPrevisao,
  diaSP,
  fichaLoterica,
  preverPorParecidos,
  resumirConcurso,
  noDiaSP,
  panoramaNacional,
  resumoFilasMercado,
  retratoMercado,
  serieMercado,
  somarDias,
  topLotericas,
  type BolaoHistorico,
  type BolaoMercado,
  type CriterioTop,
  type FiltroRegiao,
  type LotericaRef,
  type ModalidadeSlug,
  type ResumoConcurso,
} from '@radar/core';
import { concursosAVendaSimulados, historicoDeBoloesSimulado, megaDaViradaSimulada, vitrineSimulada } from '@radar/core/simulacao';
import type { Sql } from '@radar/db';
import type { FonteDadosRaioX } from './dados';
import type { FonteSimuladaRaioX } from './dados';
import type { FontePostgresRaioX } from './dados-postgres';

/**
 * Mercado (Fase 4): Monitoramento MKP, Filas, Estatísticas e Mega da Virada. A FonteMercado entrega
 * os bolões de cada concurso com a história de cotas (simulação ou snapshots_bolao do banco) e as
 * regras do core calculam tudo. Números de terceiros são ESTIMATIVAS (a interface avisa).
 */
export interface ConcursoMercado {
  /** `${modalidade}-${numero}` (o mesmo id das aberturas). */
  chave: string;
  modalidade: ModalidadeSlug;
  concurso: number;
  abreEm: Date;
  fechaEm: Date | null;
  sorteioEm: Date | null;
  especial: boolean;
  premioEstimado: number | null;
}

export interface FonteMercado {
  readonly tipo: 'simulada' | 'postgres';
  agora(): Date;
  /** Concursos à venda em `em` (um por modalidade; o especial fica de fora). */
  concursosAVenda(em: Date): Promise<ConcursoMercado[]>;
  concurso(chave: string): Promise<ConcursoMercado | null>;
  /** Bolões do concurso com a história de cotas até `ate`. */
  boloes(chave: string, ate: Date): Promise<BolaoMercado[]>;
  /** Bolões que entraram em [de, ate] (todas as lotéricas), para estatísticas. */
  historico(de: Date, ate: Date): Promise<BolaoHistorico[]>;
  /** O concurso especial (Mega da Virada) mais recente, se houver. */
  megaDaVirada(em: Date): Promise<ConcursoMercado | null>;
  /** Concursos normais da modalidade que fecharam antes de `antesDe` (mais recentes primeiro). */
  concursosAnteriores(modalidade: ModalidadeSlug, antesDe: Date, limite: number): Promise<ConcursoMercado[]>;
}

const CACHE_MS = 30_000;
function cacheado<T>(mapa: Map<string, { em: number; v: Promise<T> }>, chave: string, f: () => Promise<T>, ms = CACHE_MS): Promise<T> {
  const c = mapa.get(chave);
  if (c && Date.now() - c.em < ms) return c.v;
  const v = f();
  mapa.set(chave, { em: Date.now(), v });
  v.catch(() => mapa.delete(chave));
  return v;
}

class MercadoSimulado implements FonteMercado {
  readonly tipo = 'simulada' as const;
  private cache = new Map<string, { em: number; v: Promise<unknown> }>();
  constructor(private readonly f: FonteSimuladaRaioX) {}
  agora() {
    return this.f.agora();
  }
  private virada(em: Date) {
    const h = this.f.historico();
    return cacheado(this.cache as Map<string, { em: number; v: Promise<ReturnType<typeof megaDaViradaSimulada>> }>, `virada|${diaSP(em).slice(0, 4)}`, async () => megaDaViradaSimulada(h, em), 3_600_000);
  }
  async concursosAVenda(em: Date): Promise<ConcursoMercado[]> {
    return concursosAVendaSimulados(this.f.historico(), em).map((c) => ({ chave: c.id, modalidade: c.modalidade, concurso: c.concurso, abreEm: c.abreEm, fechaEm: c.fechaEm, sorteioEm: null, especial: false, premioEstimado: null }));
  }
  async concurso(chave: string): Promise<ConcursoMercado | null> {
    const h = this.f.historico();
    if (chave.startsWith('virada-')) {
      const v = await this.virada(this.agora());
      return v.id === chave ? paraConcurso(v) : null;
    }
    const p = h.planos.find((x) => x.id === chave);
    return p ? { chave: p.id, modalidade: p.modalidade, concurso: p.concurso, abreEm: p.t0, fechaEm: h.fechaEm(p.id), sorteioEm: null, especial: false, premioEstimado: null } : null;
  }
  async boloes(chave: string, ate: Date): Promise<BolaoMercado[]> {
    if (chave.startsWith('virada-')) return vitrineSimulada((await this.virada(ate)).sim, ate);
    const sim = this.f.historico().verdade(chave);
    return sim ? vitrineSimulada(sim, ate) : [];
  }
  async historico(de: Date, ate: Date): Promise<BolaoHistorico[]> {
    const todos = await cacheado(this.cache as Map<string, { em: number; v: Promise<BolaoHistorico[]> }>, `hist|${Math.floor(ate.getTime() / 300_000)}`, async () => historicoDeBoloesSimulado(this.f.historico(), ate), 300_000);
    return todos.filter((b) => b.entrouEm.getTime() >= de.getTime() && b.entrouEm.getTime() <= ate.getTime());
  }
  async megaDaVirada(em: Date): Promise<ConcursoMercado | null> {
    return paraConcurso(await this.virada(em));
  }
  async concursosAnteriores(modalidade: ModalidadeSlug, antesDe: Date, limite: number): Promise<ConcursoMercado[]> {
    const h = this.f.historico();
    return h.planos
      .filter((p) => p.modalidade === modalidade && h.fechaEm(p.id)!.getTime() <= antesDe.getTime())
      .sort((a, b) => b.t0.getTime() - a.t0.getTime())
      .slice(0, limite)
      .map((p) => ({ chave: p.id, modalidade: p.modalidade, concurso: p.concurso, abreEm: p.t0, fechaEm: h.fechaEm(p.id), sorteioEm: null, especial: false, premioEstimado: null }));
  }
}

function paraConcurso(v: ReturnType<typeof megaDaViradaSimulada>): ConcursoMercado {
  return { chave: v.id, modalidade: v.modalidade, concurso: v.concurso, abreEm: v.abreEm, fechaEm: v.fechaEm, sorteioEm: v.sorteioEm ?? null, especial: true, premioEstimado: v.premioEstimado ?? null };
}

const d = (v: Date | string | null): Date | null => (v === null ? null : v instanceof Date ? v : new Date(v));

class MercadoPostgres implements FonteMercado {
  readonly tipo = 'postgres' as const;
  private cache = new Map<string, { em: number; v: Promise<unknown> }>();
  constructor(
    private readonly sql: Sql,
    private readonly relogio: () => Date,
  ) {}
  agora() {
    return this.relogio();
  }
  private linhaConcurso(r: { slug: string; numero: number; abre_em: Date | string | null; fecha_em: Date | string | null; sorteio_em: Date | string | null; especial: boolean; premio_estimado: string | null }): ConcursoMercado {
    return {
      chave: `${r.slug}-${r.numero}`,
      modalidade: r.slug as ModalidadeSlug,
      concurso: r.numero,
      abreEm: d(r.abre_em) ?? new Date(0),
      fechaEm: d(r.fecha_em),
      sorteioEm: d(r.sorteio_em),
      especial: r.especial,
      premioEstimado: r.premio_estimado === null ? null : Number(r.premio_estimado),
    };
  }
  async concursosAVenda(em: Date): Promise<ConcursoMercado[]> {
    const linhas = await this.sql<Parameters<MercadoPostgres['linhaConcurso']>[0][]>`
      select distinct on (m.slug) m.slug, c.numero, c.abre_em, c.fecha_em, c.sorteio_em, c.especial, c.premio_estimado
      from concursos c join modalidades m on m.id = c.modalidade_id
      where not c.especial and c.abre_em <= ${em.toISOString()}::timestamptz
        and coalesce(c.fecha_em, c.encerrado_em, ${em.toISOString()}::timestamptz + interval '1 day') > ${em.toISOString()}::timestamptz - interval '3 hours'
        and exists (select 1 from boloes b where b.concurso_id = c.id)
      order by m.slug, c.abre_em desc`;
    return linhas.map((r) => this.linhaConcurso(r));
  }
  async concurso(chave: string): Promise<ConcursoMercado | null> {
    const m = /^(.+)-(\d+)$/.exec(chave);
    if (!m) return null;
    const [r] = await this.sql<Parameters<MercadoPostgres['linhaConcurso']>[0][]>`
      select m.slug, c.numero, c.abre_em, c.fecha_em, c.sorteio_em, c.especial, c.premio_estimado
      from concursos c join modalidades m on m.id = c.modalidade_id where m.slug = ${m[1]!} and c.numero = ${Number(m[2])}`;
    return r ? this.linhaConcurso(r) : null;
  }
  async boloes(chave: string, ate: Date): Promise<BolaoMercado[]> {
    return cacheado(this.cache as Map<string, { em: number; v: Promise<BolaoMercado[]> }>, `b|${chave}|${Math.floor(ate.getTime() / 30_000)}`, async () => {
      const m = /^(.+)-(\d+)$/.exec(chave);
      if (!m) return [];
      const ateIso = ate.toISOString();
      const bs = await this.sql<{
        id: string; codigo_caixa: string; nome: string; cidade: string; uf: string; bairro: string | null; slug: string; numero: number;
        jogos: number; dezenas: number; cotas_total: number; valor_cota: string; fila: number; first_seen_at: Date | string; cotas_disponiveis: number; esgotou_em: Date | string | null;
      }[]>`
        select b.id::text, l.codigo_caixa, l.nome, l.cidade, l.uf, l.bairro, m.slug, c.numero, b.jogos, b.dezenas, b.cotas_total, b.valor_cota, b.fila,
               b.first_seen_at, b.cotas_disponiveis, b.esgotou_em
        from boloes b join lotericas l on l.id = b.loterica_id join concursos c on c.id = b.concurso_id join modalidades m on m.id = c.modalidade_id
        where m.slug = ${m[1]!} and c.numero = ${Number(m[2])} and b.first_seen_at <= ${ateIso}::timestamptz`;
      if (!bs.length) return [];
      const snaps = await this.sql<{ bolao_id: string; coletado_em: Date | string; cotas_disponiveis: number; presente: boolean }[]>`
        select s.bolao_id::text, s.coletado_em, s.cotas_disponiveis, s.presente from snapshots_bolao s
        where s.bolao_id = any(${bs.map((b) => b.id)}::bigint[]) and s.coletado_em <= ${ateIso}::timestamptz
        order by s.bolao_id, s.coletado_em`;
      type Snap = (typeof snaps)[number];
      const porBolao = new Map<string, Snap[]>();
      for (const s of snaps) {
        const l = porBolao.get(s.bolao_id);
        if (l) l.push(s);
        else porBolao.set(s.bolao_id, [s]);
      }
      return bs.map((b): BolaoMercado => {
        const ss = porBolao.get(b.id) ?? [];
        const entrou = d(b.first_seen_at)!.getTime();
        const primeira = ss.find((s) => s.presente);
        let atual = primeira?.cotas_disponiveis ?? b.cotas_disponiveis;
        const mudancas: [number, number][] = [];
        let saiuEm: number | null = null;
        for (const s of ss) {
          const t = d(s.coletado_em)!.getTime();
          if (t <= entrou) continue;
          if (!s.presente) {
            saiuEm ??= t;
            continue;
          }
          if (s.cotas_disponiveis !== atual) mudancas.push([t, (atual = s.cotas_disponiveis)]);
        }
        const esg = d(b.esgotou_em);
        if (esg && esg.getTime() <= ate.getTime()) saiuEm = Math.min(saiuEm ?? Infinity, esg.getTime());
        return {
          id: b.id,
          loterica: { codigoCaixa: b.codigo_caixa, nome: b.nome, cidade: b.cidade, uf: b.uf, ...(b.bairro ? { bairro: b.bairro } : {}) },
          modalidade: b.slug as ModalidadeSlug,
          concurso: b.numero,
          jogos: b.jogos,
          dezenas: b.dezenas,
          cotasTotal: b.cotas_total,
          valorCotaBase: Number(b.valor_cota),
          fila: b.fila,
          entrouEm: entrou,
          disponiveisNaEntrada: primeira?.cotas_disponiveis ?? b.cotas_disponiveis,
          mudancas,
          saiuEm,
        };
      });
    });
  }
  async historico(de: Date, ate: Date): Promise<BolaoHistorico[]> {
    return cacheado(this.cache as Map<string, { em: number; v: Promise<BolaoHistorico[]> }>, `h|${diaSP(de)}|${Math.floor(ate.getTime() / 300_000)}`, async () => {
      const rs = await this.sql<{
        id: string; codigo_caixa: string; nome: string; cidade: string; uf: string; bairro: string | null; slug: string; numero: number; jogos: number; dezenas: number;
        cotas_total: number; valor_cota: string; first_seen_at: Date | string; esgotou_em: Date | string | null; disponiveis: number; encerrado: boolean;
      }[]>`
        select b.id::text, l.codigo_caixa, l.nome, l.cidade, l.uf, l.bairro, m.slug, c.numero, b.jogos, b.dezenas, b.cotas_total, b.valor_cota, b.first_seen_at, b.esgotou_em,
               coalesce(b.sobra_final, b.cotas_disponiveis) as disponiveis, (b.status = 'encerrado' or c.encerrado_em is not null) as encerrado
        from boloes b join lotericas l on l.id = b.loterica_id join concursos c on c.id = b.concurso_id join modalidades m on m.id = c.modalidade_id
        where b.first_seen_at >= ${de.toISOString()}::timestamptz and b.first_seen_at <= ${ate.toISOString()}::timestamptz and not b.estornado`;
      return rs.map((b) => ({
        id: b.id,
        loterica: { codigoCaixa: b.codigo_caixa, nome: b.nome, cidade: b.cidade, uf: b.uf, ...(b.bairro ? { bairro: b.bairro } : {}) },
        modalidade: b.slug as ModalidadeSlug,
        concurso: b.numero,
        jogos: b.jogos,
        dezenas: b.dezenas,
        cotasTotal: b.cotas_total,
        valorCotaBase: Number(b.valor_cota),
        entrouEm: d(b.first_seen_at)!,
        esgotouEm: d(b.esgotou_em),
        disponiveis: b.disponiveis,
        encerrado: b.encerrado,
      }));
    }, 300_000);
  }
  async megaDaVirada(em: Date): Promise<ConcursoMercado | null> {
    const [r] = await this.sql<Parameters<MercadoPostgres['linhaConcurso']>[0][]>`
      select m.slug, c.numero, c.abre_em, c.fecha_em, c.sorteio_em, c.especial, c.premio_estimado
      from concursos c join modalidades m on m.id = c.modalidade_id
      where c.especial and m.slug = 'mega-sena' and coalesce(c.sorteio_em, c.fecha_em, ${em.toISOString()}::timestamptz) > ${em.toISOString()}::timestamptz - interval '7 days'
      order by c.numero desc limit 1`;
    return r ? this.linhaConcurso(r) : null;
  }
  async concursosAnteriores(modalidade: ModalidadeSlug, antesDe: Date, limite: number): Promise<ConcursoMercado[]> {
    const rs = await this.sql<Parameters<MercadoPostgres['linhaConcurso']>[0][]>`
      select m.slug, c.numero, c.abre_em, c.fecha_em, c.sorteio_em, c.especial, c.premio_estimado
      from concursos c join modalidades m on m.id = c.modalidade_id
      where m.slug = ${modalidade} and not c.especial and c.abre_em is not null and c.fecha_em <= ${antesDe.toISOString()}::timestamptz
      order by c.abre_em desc limit ${limite}`;
    return rs.map((r) => this.linhaConcurso(r));
  }
}

const GLOBAL = globalThis as unknown as { __radarMercado?: WeakMap<object, FonteMercado> };

/** Fonte do Mercado para a fonte da web (mesma simulação ou mesmo banco). */
export function fonteMercado(fonte: FonteDadosRaioX): FonteMercado {
  GLOBAL.__radarMercado ??= new WeakMap();
  let m = GLOBAL.__radarMercado.get(fonte);
  if (!m) {
    m = fonte.tipo === 'postgres' ? new MercadoPostgres((fonte as FontePostgresRaioX).sql, () => fonte.agora()) : new MercadoSimulado(fonte as FonteSimuladaRaioX);
    GLOBAL.__radarMercado.set(fonte, m);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Casos de uso

/** "2026-11-21T20:00" (horário de São Paulo, do campo datetime-local) -> Date. */
export function lerInstante(v: string | null | undefined): Date | null {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v) : null;
  return m ? noDiaSP(`${m[1]}-${m[2]}-${m[3]}`, Number(m[4]), Number(m[5])) : null;
}

export function lerFiltro(sp: { uf?: string | null; cidade?: string | null }): FiltroRegiao {
  return { ...(sp.uf ? { uf: sp.uf } : {}), ...(sp.cidade ? { cidade: sp.cidade } : {}) };
}

export type Aba = 'minuto' | 'hora' | 'paginas' | 'valor';
export const lerAba = (v: string | null | undefined): Aba => (v === 'hora' || v === 'paginas' || v === 'valor' ? v : 'minuto');

/** Monitoramento MKP: um cartão por concurso à venda em `em` (agora ou o "Retrato"). */
export async function monitoramento(fonte: FonteDadosRaioX, o: { em?: Date | null; filtro?: FiltroRegiao } = {}) {
  const m = fonteMercado(fonte);
  const agora = m.agora();
  const em = o.em && o.em.getTime() < agora.getTime() ? o.em : agora;
  const concursos = await m.concursosAVenda(em);
  const cartoes = await Promise.all(
    concursos.map(async (c) => {
      const boloes = await m.boloes(c.chave, em);
      // concurso que já fechou: mostra o último retrato antes do fechamento
      const encerrado = c.fechaEm !== null && c.fechaEm.getTime() <= em.getTime();
      const instante = encerrado ? c.fechaEm!.getTime() - 1 : em.getTime();
      return {
        concurso: c,
        encerrado,
        retrato: retratoMercado(boloes, instante, { ...(o.filtro ? { filtro: o.filtro } : {}), fechaEm: c.fechaEm }),
        ufs: [...new Set(boloes.map((b) => b.loterica.uf))].sort(),
      };
    }),
  );
  return { em, retrato: em.getTime() !== agora.getTime(), cartoes, ufs: [...new Set(cartoes.flatMap((c) => c.ufs))].sort() };
}

/** Abas do Monitoramento para um concurso: minuto a minuto (última hora), hora a hora, páginas, R$. */
export async function abasDoConcurso(fonte: FonteDadosRaioX, chave: string, o: { em: Date; aba: Aba; filtro?: FiltroRegiao }) {
  const m = fonteMercado(fonte);
  const c = await m.concurso(chave);
  if (!c) return null;
  const boloes = await m.boloes(chave, o.em);
  const filtro = o.filtro ? { filtro: o.filtro } : {};
  const fim = Math.min(o.em.getTime(), (c.fechaEm ?? o.em).getTime() + 60_000);
  const minuto = Math.floor(fim / 60_000) * 60_000 + 60_000;
  const porMinuto = serieMercado(boloes, { de: Math.max(c.abreEm.getTime() - 60_000, minuto - 60 * 60_000), ate: minuto, passoMs: 60_000, fechaEm: c.fechaEm, ...filtro });
  const hora0 = Math.floor(c.abreEm.getTime() / 3_600_000) * 3_600_000;
  const porHora = serieMercado(boloes, { de: hora0, ate: Math.floor(fim / 3_600_000) * 3_600_000 + 3_600_000, passoMs: 3_600_000, fechaEm: c.fechaEm, ...filtro });
  const filas = resumoFilasMercado(boloes, o.em, { fechaEm: c.fechaEm, maiores: 10, ...filtro });
  return { concurso: c, porMinuto, porHora, filas };
}

/** Filas MKP por concurso e região. */
export async function filasDoConcurso(fonte: FonteDadosRaioX, chave: string, o: { em?: Date | null; filtro?: FiltroRegiao } = {}) {
  const m = fonteMercado(fonte);
  const c = await m.concurso(chave);
  if (!c) return null;
  const em = o.em ?? m.agora();
  const boloes = await m.boloes(chave, em);
  const cidades: Record<string, string[]> = {};
  for (const b of boloes) (cidades[b.loterica.uf] ??= []).includes(b.loterica.cidade) || cidades[b.loterica.uf]!.push(b.loterica.cidade);
  for (const k of Object.keys(cidades)) cidades[k]!.sort((a, b) => a.localeCompare(b));
  return { concurso: c, resumo: resumoFilasMercado(boloes, em, { fechaEm: c.fechaEm, ...(o.filtro ? { filtro: o.filtro } : {}) }), ufs: Object.keys(cidades).sort(), cidades };
}

/** Estatísticas › Loterias: panorama nacional no último retrato. */
export async function panoramaLoterias(fonte: FonteDadosRaioX, o: { filtro?: FiltroRegiao } = {}) {
  const m = fonteMercado(fonte);
  const em = m.agora();
  const concursos = await m.concursosAVenda(em);
  const itens = await Promise.all(
    concursos.map(async (c) => {
      const boloes = await m.boloes(c.chave, em);
      const filtro = o.filtro ? { filtro: o.filtro } : {};
      const retrato = retratoMercado(boloes, em, { fechaEm: c.fechaEm, ...filtro });
      const lot = [...new Set(boloes.filter((b) => !o.filtro?.uf || b.loterica.uf === o.filtro.uf).map((b) => b.loterica.codigoCaixa))];
      return { modalidade: c.modalidade, concurso: c.concurso, retrato, lotericasCodigos: lot };
    }),
  );
  return { em, linhas: panoramaNacional(itens) };
}

function periodo(agora: Date, dias: number) {
  const ate = diaSP(agora);
  const de = somarDias(ate, -(dias - 1));
  return { de, ate, inicio: noDiaSP(de, 0, 0) };
}

/** Estatísticas › Lotéricas: Top 10 do período. */
export async function topDoPeriodo(fonte: FonteDadosRaioX, o: { dias?: number; criterio?: CriterioTop; filtro?: FiltroRegiao } = {}) {
  const m = fonteMercado(fonte);
  const agora = m.agora();
  const p = periodo(agora, o.dias ?? 30);
  const todos = await m.historico(p.inicio, agora);
  const filtro = o.filtro?.uf || o.filtro?.cidade ? { filtro: { ...(o.filtro.uf ? { uf: o.filtro.uf } : {}), ...(o.filtro.cidade ? { cidade: o.filtro.cidade } : {}) } } : {};
  return { de: p.de, ate: p.ate, criterio: o.criterio ?? 'valor', linhas: topLotericas(todos, { de: p.de, ate: p.ate, criterio: o.criterio ?? 'valor', ...filtro }) };
}

/** Ficha completa da lotérica (Estatísticas › Lotéricas). */
export async function fichaDaLoterica(fonte: FonteDadosRaioX, codigo: string, o: { dias?: number } = {}) {
  const m = fonteMercado(fonte);
  const agora = m.agora();
  const p = periodo(agora, o.dias ?? 30);
  const todos = await m.historico(p.inicio, agora);
  return fichaLoterica(codigo, todos, { agora, de: p.de, ate: p.ate });
}

/** Mega da Virada: retrato, filas e evolução do concurso especial. */
export async function painelMegaDaVirada(fonte: FonteDadosRaioX, o: { filtro?: FiltroRegiao } = {}) {
  const m = fonteMercado(fonte);
  const agora = m.agora();
  const c = await m.megaDaVirada(agora);
  if (!c) return null;
  const boloes = await m.boloes(c.chave, agora);
  const filtro = o.filtro ? { filtro: o.filtro } : {};
  const dia0 = noDiaSP(diaSP(c.abreEm), 0, 0).getTime();
  const porDia = serieMercado(boloes, { de: dia0, ate: noDiaSP(somarDias(diaSP(agora), 1), 0, 0).getTime(), passoMs: 86_400_000, fechaEm: c.fechaEm, ...filtro });
  return {
    concurso: c,
    agora,
    retrato: retratoMercado(boloes, agora, { fechaEm: c.fechaEm, ...filtro }),
    filas: resumoFilasMercado(boloes, agora, { fechaEm: c.fechaEm, maiores: 15, ...filtro }),
    porDia,
    ufs: [...new Set(boloes.map((b) => b.loterica.uf))].sort(),
  };
}

const RESUMOS = new Map<string, ResumoConcurso>();

/**
 * Previsão de fechamento do concurso em andamento por concursos parecidos (mesma modalidade, mesma
 * fração da janela), com faixa de 80%, pico, mínimo para zerar e o backtest dos últimos 16.
 */
export async function previsaoDoConcurso(fonte: FonteDadosRaioX, chave: string, o: { em?: Date | null } = {}) {
  const m = fonteMercado(fonte);
  const c = await m.concurso(chave);
  if (!c || !c.fechaEm) return null;
  const em = o.em ?? m.agora();
  if (em.getTime() >= c.fechaEm.getTime() || em.getTime() <= c.abreEm.getTime()) return { concurso: c, previsao: null, backtest: null, motivo: 'fora da janela de vendas' };
  const fracao = Math.round(((em.getTime() - c.abreEm.getTime()) / (c.fechaEm.getTime() - c.abreEm.getTime())) * 100) / 100;
  const anteriores = await m.concursosAnteriores(c.modalidade, c.abreEm, 40);
  const resumos: ResumoConcurso[] = [];
  for (const a of anteriores) {
    if (!a.fechaEm) continue;
    const k = `${fonte.tipo}|${a.chave}|${fracao}`;
    let r = RESUMOS.get(k);
    if (!r) {
      const boloes = await m.boloes(a.chave, a.fechaEm);
      if (!boloes.length) continue;
      r = resumirConcurso({ chave: a.chave, abreEm: a.abreEm.getTime(), fechaEm: a.fechaEm.getTime(), boloes }, fracao);
      if (RESUMOS.size > 5000) RESUMOS.clear();
      RESUMOS.set(k, r);
    }
    resumos.push(r);
  }
  const boloes = await m.boloes(chave, em);
  const atual = resumirConcurso({ chave, abreEm: c.abreEm.getTime(), fechaEm: c.fechaEm.getTime(), boloes }, fracao, { agora: em.getTime() });
  const previsao = preverPorParecidos(atual, resumos, { agora: em.getTime() });
  const backtest = backtestPrevisao(resumos, { ultimos: 16 });
  const ritmo = retratoMercado(boloes, em, { fechaEm: c.fechaEm, maiores: 0 }).ritmoPorMinuto * 60;
  return { concurso: c, fracao, estado: atual.estado, previsao, backtest, ritmoPorHora: Math.round(ritmo), historico: resumos.length, motivo: previsao ? null : 'histórico insuficiente (menos de 3 concursos fechados)' };
}

export type { LotericaRef };
