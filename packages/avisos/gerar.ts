import {
  acompanharZerar,
  alertaEncerramento,
  alertaPremio,
  alertaResultado,
  alertaResumoSemanal,
  alertasDeAbertura,
  alertasDeVendas,
  alertaZerar,
  conferirBolao,
  diaSP,
  metricasSemanais,
  modalidadeConferivel,
  resumoSemanalDevido,
  somarDias,
  noDiaSP,
  tarifaPorCota,
  vaiZerar,
  type AberturaInfo,
  type AlertaAviso,
  type EstadoZerar,
  type LotericaRef,
  type ModalidadeSlug,
  type ParticipacaoInfo,
} from '@radar/core';
import type { Sql } from '@radar/db';
import { lerJogos, lerResultados } from '@radar/db/conferencia';
import { despachar } from './despachar';
import type { EnviarPush, RepositorioAvisos } from './tipos';

/**
 * Gera os alertas a partir do banco do coletor (roda no worker a cada ~20 s):
 * - monitorada entrou na abertura (a cada rodada);
 * - vendas, encerramento, previsão de zerar, resultado, prêmio e o resumo semanal (a cada 1 min).
 * Idempotente: cada pessoa recebe cada `chave` uma vez só (notificacoes.unique(usuario_id, chave)).
 */
export interface LogAvisos {
  info(o: object, m: string): void;
  warn(o: object, m: string): void;
}

type Contagem = Record<string, number>;
const id = (slug: string, numero: number) => `${slug}-${numero}`;
const ref = (r: { codigo_caixa: string; nome: string; cidade: string; uf: string }): LotericaRef => ({ codigoCaixa: r.codigo_caixa, nome: r.nome, cidade: r.cidade, uf: r.uf });

export class GeradorDeAlertas {
  private ultimaVenda: Date | null = null;
  private ultimaRodadaLenta = Number.NEGATIVE_INFINITY;
  private readonly zerar = new Map<string, EstadoZerar>();
  private resumoFeito: string | null = null;

  constructor(
    private readonly sql: Sql,
    private readonly repo: RepositorioAvisos,
    private readonly enviar: EnviarPush | null,
    private readonly log?: LogAvisos,
  ) {}

  async rodar(agora = new Date()): Promise<Contagem> {
    const c: Contagem = {};
    const passo = async (nome: string, f: () => Promise<number>) => {
      try {
        c[nome] = await f();
      } catch (e) {
        this.log?.warn({ passo: nome, erro: e instanceof Error ? e.message : String(e) }, 'falha ao gerar alertas');
      }
    };
    await passo('abertura', () => this.aberturas(agora));
    if (agora.getTime() - this.ultimaRodadaLenta >= 60_000) {
      this.ultimaRodadaLenta = agora.getTime();
      await passo('vendas', () => this.vendas(agora));
      await passo('encerramento', () => this.encerramentos(agora));
      await passo('zerar', () => this.previsaoZerar(agora));
      await passo('resultado', () => this.resultadosEPremios(agora));
      await passo('resumo', () => this.resumoSemanal(agora));
    }
    const total = Object.values(c).reduce((s, n) => s + n, 0);
    if (total) this.log?.info({ alertas: c }, 'alertas despachados');
    return c;
  }

  private async paraContas(alerta: AlertaAviso, contas: readonly string[]): Promise<number> {
    let n = 0;
    for (const contaId of contas) n += (await despachar(this.repo, alerta, { contaId }, this.enviar)).notificacoes;
    return n;
  }

  /** O 1º bolão de cada monitorada em cada abertura (até T0 + 30 min). */
  async aberturas(agora: Date): Promise<number> {
    const monitoradas = await this.repo.contasQueMonitoram();
    if (!monitoradas.size) return 0;
    const desde = new Date(agora.getTime() - 40 * 60_000);
    const linhas = await this.sql<{ codigo_caixa: string; nome: string; cidade: string; uf: string; slug: ModalidadeSlug; numero: number; abre_em: Date; first_seen_at: Date; pos_uf: number | null; pos_cidade: number | null }[]>`
      select l.codigo_caixa, l.nome, l.cidade, l.uf, m.slug, c.numero, c.abre_em, b.first_seen_at,
             coalesce(b.pos_entrada_uf, b.pos_entrada_calc_uf) as pos_uf, coalesce(b.pos_entrada_cidade, b.pos_entrada_calc_cidade) as pos_cidade
      from boloes b
      join lotericas l on l.id = b.loterica_id
      join concursos c on c.id = b.concurso_id
      join modalidades m on m.id = c.modalidade_id
      where b.first_seen_at >= ${desde.toISOString()}::timestamptz and c.abre_em is not null
        and b.first_seen_at between c.abre_em and c.abre_em + interval '30 minutes'
        and l.codigo_caixa = any(${[...monitoradas.keys()]})`;
    const alertas = alertasDeAbertura(
      linhas.map((r) => ({
        loterica: ref(r),
        aberturaId: id(r.slug, r.numero),
        modalidade: r.slug,
        concurso: r.numero,
        t0: new Date(r.abre_em),
        entrouEm: new Date(r.first_seen_at),
        posUf: r.pos_uf,
        posCidade: r.pos_cidade,
      })),
    );
    let n = 0;
    for (const a of alertas) n += await this.paraContas(a, monitoradas.get(a.lotericaCodigo!) ?? []);
    return n;
  }

  /** Vendas das lojas das contas desde a rodada anterior, agrupadas por loja. */
  async vendas(agora: Date): Promise<number> {
    const desde = this.ultimaVenda ?? new Date(agora.getTime() - 2 * 60_000);
    this.ultimaVenda = agora;
    const linhas = await this.sql<{ evento_id: string; em: Date; quantidade: number | null; bolao_id: string; valor_cota: string; valor_cota_exibido: string | null; codigo_caixa: string; nome: string; cidade: string; uf: string; slug: ModalidadeSlug; numero: number; data_sorteio: string | Date | null }[]>`
      select e.id::text as evento_id, e.em, e.quantidade, b.id::text as bolao_id, b.valor_cota, b.valor_cota_exibido, l.codigo_caixa, l.nome, l.cidade, l.uf, m.slug, c.numero, c.data_sorteio
      from eventos_bolao e
      join boloes b on b.id = e.bolao_id
      join lotericas l on l.id = b.loterica_id
      join concursos c on c.id = b.concurso_id
      join modalidades m on m.id = c.modalidade_id
      where e.tipo = 'venda' and e.em > ${desde.toISOString()}::timestamptz and e.em <= ${agora.toISOString()}::timestamptz
        and l.codigo_caixa in (select loterica_codigo from conta_lojas)`;
    const hoje = diaSP(agora);
    const alertas = alertasDeVendas(
      linhas.map((r) => {
        const base = Number(r.valor_cota);
        const cota = r.valor_cota_exibido ? Number(r.valor_cota_exibido) : base + tarifaPorCota(base);
        const sorteio = r.data_sorteio ? (typeof r.data_sorteio === 'string' ? r.data_sorteio.slice(0, 10) : r.data_sorteio.toISOString().slice(0, 10)) : null;
        const q = r.quantidade ?? 1;
        return { loterica: ref(r), modalidade: r.slug, concurso: r.numero, bolaoId: r.bolao_id, cotas: q, valor: q * cota, em: new Date(r.em), sorteiaHoje: sorteio === hoje, eventoId: Number(r.evento_id) };
      }),
      agora,
    );
    let n = 0;
    for (const a of alertas) n += await this.paraContas(a, await this.repo.contasComLoja(a.lotericaCodigo!));
    return n;
  }

  /** Resumo de cada concurso encerrado nas últimas 2 h, por loja. */
  async encerramentos(agora: Date): Promise<number> {
    const linhas = await this.sql<{ codigo_caixa: string; nome: string; cidade: string; uf: string; slug: ModalidadeSlug; numero: number; encerrado_em: Date; boloes: number; total: number; vendidas: number; sobra: string }[]>`
      select l.codigo_caixa, l.nome, l.cidade, l.uf, m.slug, c.numero, c.encerrado_em,
             count(*)::int as boloes, sum(b.cotas_total)::int as total,
             sum(b.cotas_total - coalesce(b.sobra_final, b.cotas_disponiveis))::int as vendidas,
             sum(coalesce(b.sobra_final, b.cotas_disponiveis) * b.valor_cota) as sobra
      from boloes b
      join lotericas l on l.id = b.loterica_id
      join concursos c on c.id = b.concurso_id
      join modalidades m on m.id = c.modalidade_id
      where c.encerrado_em > ${new Date(agora.getTime() - 2 * 3_600_000).toISOString()}::timestamptz and c.encerrado_em <= ${agora.toISOString()}::timestamptz
        and b.status <> 'estornado' and l.codigo_caixa in (select loterica_codigo from conta_lojas)
      group by l.codigo_caixa, l.nome, l.cidade, l.uf, m.slug, c.numero, c.encerrado_em`;
    let n = 0;
    for (const r of linhas) {
      const a = alertaEncerramento({ loterica: ref(r), modalidade: r.slug, concurso: r.numero, boloes: r.boloes, cotasTotal: r.total, cotasVendidas: r.vendidas, sobra: Math.round(Number(r.sobra) * 100) / 100, em: new Date(r.encerrado_em) });
      n += await this.paraContas(a, await this.repo.contasComLoja(r.codigo_caixa));
    }
    return n;
  }

  /** "Vai zerar" pelo ritmo da última hora, mantido por 45 min. */
  async previsaoZerar(agora: Date): Promise<number> {
    const linhas = await this.sql<{ codigo_caixa: string; nome: string; cidade: string; uf: string; slug: ModalidadeSlug; numero: number; fecha_em: Date; restantes: number; ultima_hora: number }[]>`
      select l.codigo_caixa, l.nome, l.cidade, l.uf, m.slug, c.numero, c.fecha_em,
             sum(b.cotas_disponiveis)::int as restantes,
             coalesce((select sum(coalesce(e.quantidade, 1)) from eventos_bolao e join boloes b2 on b2.id = e.bolao_id
                       where b2.concurso_id = c.id and b2.loterica_id = l.id and e.tipo = 'venda'
                         and e.em > ${new Date(agora.getTime() - 3_600_000).toISOString()}::timestamptz), 0)::int as ultima_hora
      from boloes b
      join lotericas l on l.id = b.loterica_id
      join concursos c on c.id = b.concurso_id
      join modalidades m on m.id = c.modalidade_id
      where c.fecha_em > ${agora.toISOString()}::timestamptz and b.status = 'a_venda'
        and l.codigo_caixa in (select loterica_codigo from conta_lojas)
      group by l.id, l.codigo_caixa, l.nome, l.cidade, l.uf, m.slug, c.id, c.numero, c.fecha_em`;
    let n = 0;
    const vistos = new Set<string>();
    for (const r of linhas) {
      const k = `${r.codigo_caixa}|${id(r.slug, r.numero)}`;
      vistos.add(k);
      const z = vaiZerar({ restantes: r.restantes, vendidasUltimaHora: r.ultima_hora, fechaEm: new Date(r.fecha_em), agora });
      const s = acompanharZerar(this.zerar.get(k), z.zera, agora);
      this.zerar.set(k, s.estado);
      if (s.avisar && z.horas !== null) {
        n += await this.paraContas(alertaZerar({ loterica: ref(r), modalidade: r.slug, concurso: r.numero, restantes: r.restantes, horas: z.horas, agora }), await this.repo.contasComLoja(r.codigo_caixa));
      }
    }
    for (const k of this.zerar.keys()) if (!vistos.has(k)) this.zerar.delete(k);
    return n;
  }

  /** Resultado oficial novo (para todos que quiserem) e prêmios nos bolões das lojas das contas. */
  async resultadosEPremios(agora: Date): Promise<number> {
    const novos = await this.sql<{ concurso_id: string; slug: ModalidadeSlug; numero: number; dezenas: number[]; acumulado: boolean; obtido_em: Date }[]>`
      select r.concurso_id::text, m.slug, c.numero, r.dezenas, r.acumulado, r.obtido_em
      from resultados r join concursos c on c.id = r.concurso_id join modalidades m on m.id = c.modalidade_id
      where r.origem = 'caixa' and r.obtido_em > ${new Date(agora.getTime() - 3 * 3_600_000).toISOString()}::timestamptz`;
    if (!novos.length) return 0;
    let n = 0;
    const usuarios = await this.repo.usuariosComConta();
    for (const r of novos) {
      n += (await despachar(this.repo, alertaResultado({ modalidade: r.slug, concurso: r.numero, dezenas: r.dezenas, acumulou: r.acumulado, em: new Date(r.obtido_em) }), { usuarios }, this.enviar)).notificacoes;
    }
    const ids = novos.filter((r) => modalidadeConferivel(r.slug)).map((r) => Number(r.concurso_id));
    if (!ids.length) return n;
    const boloes = await this.sql<{ id: string; cotas_total: number; sobradas: number; codigo_caixa: string; nome: string; cidade: string; uf: string; slug: ModalidadeSlug; numero: number; concurso_id: string }[]>`
      select b.id::text, b.cotas_total, coalesce(b.sobra_final, b.cotas_disponiveis) as sobradas, l.codigo_caixa, l.nome, l.cidade, l.uf, m.slug, c.numero, b.concurso_id::text
      from boloes b join lotericas l on l.id = b.loterica_id join concursos c on c.id = b.concurso_id join modalidades m on m.id = c.modalidade_id
      where b.concurso_id = any(${ids}) and b.status <> 'estornado' and l.codigo_caixa in (select loterica_codigo from conta_lojas)`;
    if (!boloes.length) return n;
    const [resultados, jogos] = await Promise.all([lerResultados(this.sql, ids), lerJogos(this.sql, boloes.map((b) => ({ id: Number(b.id), slug: b.slug })))]);
    for (const b of boloes) {
      const r = resultados.get(Number(b.concurso_id));
      const js = jogos.get(Number(b.id));
      if (!r || !js?.length) continue;
      const c = conferirBolao(js, { modalidade: b.slug, concurso: b.numero, ...r.resultado }, b.cotas_total, b.sobradas);
      if (!c || c.premioTotal <= 0) continue;
      const faixas = c.apostas.flatMap((a) => a.faixas).sort((x, y) => x.faixa - y.faixa);
      const faixa = faixas[0] ? `${faixas[0].descricao}${faixas.length > 1 ? ` e mais ${faixas.length - 1} ${faixas.length === 2 ? 'faixa' : 'faixas'}` : ''}` : 'premiado';
      const a = alertaPremio({ loterica: ref(b), modalidade: b.slug, concurso: b.numero, bolaoId: b.id, faixa, premioTotal: c.premioTotal, premioLoterica: c.premioLoterica, em: agora });
      n += await this.paraContas(a, await this.repo.contasComLoja(b.codigo_caixa));
    }
    return n;
  }

  /** Segunda 08:00: como foram as monitoradas de cada conta na semana anterior. */
  async resumoSemanal(agora: Date): Promise<number> {
    const r = resumoSemanalDevido(agora);
    if (!r.devido || this.resumoFeito === r.semana) return 0;
    // só nas primeiras 12 h depois da hora marcada (worker parado no fim de semana não manda atrasado na sexta)
    if (agora.getTime() - r.enviarEm.getTime() > 12 * 3_600_000) {
      this.resumoFeito = r.semana;
      return 0;
    }
    const monitoradas = await this.repo.contasQueMonitoram();
    if (!monitoradas.size) {
      this.resumoFeito = r.semana;
      return 0;
    }
    const ini = noDiaSP(r.semana, 0, 0);
    const fim = noDiaSP(somarDias(r.semana, 7), 0, 0);
    const codigos = [...monitoradas.keys()];
    const [abs, parts, lots] = await Promise.all([
      this.sql<{ slug: ModalidadeSlug; numero: number; t0: Date }[]>`
        select m.slug, c.numero, a.t0 from aberturas a join concursos c on c.id = a.concurso_id join modalidades m on m.id = c.modalidade_id
        where a.processada_em is not null and a.t0 >= ${ini.toISOString()}::timestamptz and a.t0 < ${fim.toISOString()}::timestamptz`,
      this.sql<{ slug: ModalidadeSlug; numero: number; codigo_caixa: string; primeiro_em: Date; atraso_s: string; pos_cidade: number; pos_uf: number; pos_brasil: number; n_boloes_1h: number; valor_1h: string; pct_vendido: string | null; sobra: string | null; empate: boolean }[]>`
        select m.slug, c.numero, l.codigo_caixa, p.primeiro_em, p.atraso_s, p.pos_cidade, p.pos_uf, p.pos_brasil, p.n_boloes_1h, p.valor_1h, p.pct_vendido, p.sobra, p.empate
        from abertura_participacoes p join aberturas a on a.id = p.abertura_id join concursos c on c.id = a.concurso_id
        join modalidades m on m.id = c.modalidade_id join lotericas l on l.id = p.loterica_id
        where a.processada_em is not null and a.t0 >= ${ini.toISOString()}::timestamptz and a.t0 < ${fim.toISOString()}::timestamptz and l.codigo_caixa = any(${codigos})`,
      this.sql<{ codigo_caixa: string; nome: string; cidade: string; uf: string }[]>`select codigo_caixa, nome, cidade, uf from lotericas where codigo_caixa = any(${codigos})`,
    ]);
    const aberturas: AberturaInfo[] = abs.map((a) => ({ id: id(a.slug, a.numero), modalidade: a.slug, t0: new Date(a.t0) }));
    const participacoes: ParticipacaoInfo[] = parts.map((p) => ({
      aberturaId: id(p.slug, p.numero),
      lotericaCodigo: p.codigo_caixa,
      primeiroEm: new Date(p.primeiro_em),
      atrasoS: Number(p.atraso_s),
      posCidade: p.pos_cidade,
      posUf: p.pos_uf,
      posBrasil: p.pos_brasil,
      nBoloes1h: p.n_boloes_1h,
      valor1h: Number(p.valor_1h),
      pctVendido: p.pct_vendido === null ? null : Number(p.pct_vendido),
      sobra: p.sobra === null ? null : Number(p.sobra),
      empate: p.empate,
    }));
    const porCodigo = new Map(lots.map((l) => [l.codigo_caixa, ref(l)]));
    const ate = new Date(fim.getTime() - 1);
    const porConta = new Map<string, string[]>();
    for (const [codigo, contas] of monitoradas) for (const c of contas) porConta.set(c, [...(porConta.get(c) ?? []), codigo]);
    let n = 0;
    for (const [contaId, cods] of porConta) {
      const linhas = cods
        .map((codigo) => ({ loterica: porCodigo.get(codigo) ?? { codigoCaixa: codigo, nome: `Lotérica ${codigo}`, cidade: '', uf: '' }, m: metricasSemanais(codigo, aberturas, participacoes, { ate, semanas: 1, escopo: 'uf' })[0]! }))
        .filter((l) => l.m);
      const a = alertaResumoSemanal(r.semana, linhas, agora);
      if (a) n += (await despachar(this.repo, a, { contaId }, this.enviar)).notificacoes;
    }
    this.resumoFeito = r.semana;
    return n;
  }
}

/** Para testes e para a demonstração: o dia SP de hoje às 00:00. */
export const inicioDeHoje = (agora: Date) => noDiaSP(diaSP(agora), 0, 0);
