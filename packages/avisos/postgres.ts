import { lerPreferencias, type Categoria, type Papel, type PreferenciasAparelho } from '@radar/core';
import type { Sql } from '@radar/db';
import type { Aparelho, MembroDestino, Monitorada, Notificacao, RepositorioAvisos, ResultadoPush } from './tipos';

type Linha = Record<string, unknown>;
const data = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string | Date));
const iso = (d: Date) => d.toISOString();

const aparelho = (r: Linha): Aparelho => ({
  id: r.id as string,
  usuarioId: r.usuario_id as string,
  endpoint: r.endpoint as string,
  p256dh: r.p256dh as string,
  auth: r.auth as string,
  nome: (r.nome as string | null) ?? null,
  preferencias: lerPreferencias(r.preferencias),
  criadoEm: data(r.criado_em)!,
  vistoEm: data(r.visto_em)!,
  falhas: Number(r.falhas),
  desativadoEm: data(r.desativado_em),
});
const notificacao = (r: Linha): Notificacao => ({
  id: String(r.id),
  usuarioId: r.usuario_id as string,
  contaId: (r.conta_id as string | null) ?? null,
  categoria: r.categoria as Categoria,
  titulo: r.titulo as string,
  corpo: r.corpo as string,
  url: (r.url as string | null) ?? null,
  chave: r.chave as string,
  criadoEm: data(r.criado_em)!,
  lidaEm: data(r.lida_em),
  enviadas: Number(r.enviadas),
});

/** Monitoradas, aparelhos e notificações no PostgreSQL (migração 0008). */
export class RepositorioAvisosPostgres implements RepositorioAvisos {
  readonly tipo = 'postgres' as const;
  constructor(private readonly sql: Sql) {}

  async monitoradas(contaId: string): Promise<Monitorada[]> {
    const rs = await this.sql`select * from monitoradas where conta_id = ${contaId} order by criado_em`;
    return rs.map((r) => ({ contaId: r.conta_id as string, codigo: r.loterica_codigo as string, apelido: (r.apelido as string | null) ?? null, criadoEm: data(r.criado_em)! }));
  }
  async contasQueMonitoram(codigos?: readonly string[]) {
    const rs = codigos
      ? await this.sql`select conta_id, loterica_codigo from monitoradas where loterica_codigo = any(${codigos as string[]})`
      : await this.sql`select conta_id, loterica_codigo from monitoradas`;
    const out = new Map<string, string[]>();
    for (const r of rs) out.set(r.loterica_codigo as string, [...(out.get(r.loterica_codigo as string) ?? []), r.conta_id as string]);
    return out;
  }
  async monitorar(m: { contaId: string; codigo: string; apelido?: string | null }) {
    await this.sql`
      insert into monitoradas (conta_id, loterica_codigo, apelido) values (${m.contaId}, ${m.codigo}, ${m.apelido ?? null})
      on conflict (conta_id, loterica_codigo) do update set apelido = coalesce(excluded.apelido, monitoradas.apelido)`;
  }
  async deixarDeMonitorar(contaId: string, codigo: string) {
    await this.sql`delete from monitoradas where conta_id = ${contaId} and loterica_codigo = ${codigo}`;
  }

  async membrosDaConta(contaId: string): Promise<MembroDestino[]> {
    const rs = await this.sql`select usuario_id, papel, telas, lojas from membros where conta_id = ${contaId}`;
    return rs.map((r) => ({ usuarioId: r.usuario_id as string, papel: r.papel as Papel, telas: (r.telas as string[] | null) ?? null, lojas: (r.lojas as string[] | null) ?? null }));
  }
  async contasComLoja(codigo: string) {
    return (await this.sql`select conta_id from conta_lojas where loterica_codigo = ${codigo}`).map((r) => r.conta_id as string);
  }
  async usuariosComConta() {
    const rs = await this.sql`select distinct on (usuario_id) usuario_id, conta_id from membros order by usuario_id, criado_em`;
    return rs.map((r) => ({ usuarioId: r.usuario_id as string, contaId: r.conta_id as string }));
  }

  async aparelhos(usuarioId: string) {
    return (await this.sql`select * from aparelhos where usuario_id = ${usuarioId} and desativado_em is null order by criado_em`).map(aparelho);
  }
  async aparelhoPorEndpoint(endpoint: string) {
    const [r] = await this.sql`select * from aparelhos where endpoint = ${endpoint}`;
    return r ? aparelho(r) : null;
  }
  async salvarAparelho(a: { usuarioId: string; endpoint: string; p256dh: string; auth: string; nome?: string | null; preferencias?: PreferenciasAparelho }) {
    const prefs = a.preferencias ? this.sql.json(a.preferencias as unknown as Parameters<Sql['json']>[0]) : null;
    const [r] = await this.sql`
      insert into aparelhos (usuario_id, endpoint, p256dh, auth, nome, preferencias)
      values (${a.usuarioId}, ${a.endpoint}, ${a.p256dh}, ${a.auth}, ${a.nome ?? null}, coalesce(${prefs}::jsonb, '{}'::jsonb))
      on conflict (endpoint) do update set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth,
        nome = coalesce(excluded.nome, aparelhos.nome), visto_em = now(), falhas = 0, desativado_em = null
        ${a.preferencias ? this.sql`, preferencias = excluded.preferencias` : this.sql``}
      returning *`;
    return aparelho(r!);
  }
  async preferenciasDoAparelho(id: string, usuarioId: string, p: PreferenciasAparelho) {
    const r = await this.sql`update aparelhos set preferencias = ${this.sql.json(lerPreferencias(p) as unknown as Parameters<Sql['json']>[0])} where id = ${id} and usuario_id = ${usuarioId} returning 1`;
    return r.length > 0;
  }
  async removerAparelho(id: string, usuarioId: string) {
    await this.sql`delete from aparelhos where id = ${id} and usuario_id = ${usuarioId}`;
  }
  async registrarEnvio(id: string, r: ResultadoPush, em: Date) {
    if (r === 'ok') await this.sql`update aparelhos set falhas = 0, visto_em = ${iso(em)}::timestamptz where id = ${id}`;
    else if (r === 'expirado') await this.sql`update aparelhos set desativado_em = ${iso(em)}::timestamptz where id = ${id}`;
    else await this.sql`update aparelhos set falhas = falhas + 1, desativado_em = case when falhas + 1 >= 10 then ${iso(em)}::timestamptz else desativado_em end where id = ${id}`;
  }

  async criarNotificacao(n: Omit<Notificacao, 'id' | 'lidaEm' | 'enviadas'>) {
    const [r] = await this.sql`
      insert into notificacoes (usuario_id, conta_id, categoria, titulo, corpo, url, chave, criado_em)
      values (${n.usuarioId}, ${n.contaId}, ${n.categoria}, ${n.titulo}, ${n.corpo}, ${n.url}, ${n.chave}, ${iso(n.criadoEm)}::timestamptz)
      on conflict (usuario_id, chave) do nothing returning *`;
    return r ? notificacao(r) : null;
  }
  async notificacoes(usuarioId: string, limite = 50) {
    return (await this.sql`select * from notificacoes where usuario_id = ${usuarioId} order by criado_em desc, id desc limit ${limite}`).map(notificacao);
  }
  async naoLidas(usuarioId: string) {
    const [r] = await this.sql<{ n: number }[]>`select count(*)::int as n from notificacoes where usuario_id = ${usuarioId} and lida_em is null`;
    return r!.n;
  }
  async marcarLidas(usuarioId: string, ids?: readonly string[]) {
    if (ids) await this.sql`update notificacoes set lida_em = now() where usuario_id = ${usuarioId} and lida_em is null and id = any(${ids.map(Number)})`;
    else await this.sql`update notificacoes set lida_em = now() where usuario_id = ${usuarioId} and lida_em is null`;
  }
  async contarEnvio(notificacaoId: string, n: number) {
    await this.sql`update notificacoes set enviadas = enviadas + ${n} where id = ${Number(notificacaoId)}`;
  }
}
