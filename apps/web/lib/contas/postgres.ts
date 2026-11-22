import type { Papel } from '@radar/core';
import type { Sql } from '@radar/db';
import type { Conta, Convite, LojaDaConta, Membro, RepositorioContas, Sessao, TokenLogin, Usuario } from './tipos';

type Linha = Record<string, unknown>;
const data = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string | Date));

const usuario = (r: Linha): Usuario => ({
  id: r.id as string,
  email: r.email as string,
  nome: r.nome as string,
  senhaHash: (r.senha_hash as string | null) ?? null,
  emailVerificadoEm: data(r.email_verificado_em),
  criadoEm: data(r.criado_em)!,
});
const conta = (r: Linha): Conta => ({ id: r.id as string, nome: r.nome as string, criadoEm: data(r.criado_em)! });
const loja = (r: Linha): LojaDaConta => ({
  contaId: r.conta_id as string,
  codigo: r.loterica_codigo as string,
  nome: r.nome as string,
  franquiaLimite: Number(r.franquia_limite),
  verificadaEm: data(r.verificada_em),
});
const membro = (r: Linha): Membro => ({
  contaId: r.conta_id as string,
  usuarioId: r.usuario_id as string,
  papel: r.papel as Papel,
  telas: (r.telas as string[] | null) ?? null,
  lojas: (r.lojas as string[] | null) ?? null,
  criadoEm: data(r.criado_em)!,
});
const convite = (r: Linha): Convite => ({
  id: r.id as string,
  contaId: r.conta_id as string,
  email: r.email as string,
  papel: r.papel as Convite['papel'],
  telas: (r.telas as string[] | null) ?? null,
  lojas: (r.lojas as string[] | null) ?? null,
  tokenHash: r.token_hash as string,
  criadoPor: (r.criado_por as string | null) ?? null,
  criadoEm: data(r.criado_em)!,
  expiraEm: data(r.expira_em)!,
  aceitoEm: data(r.aceito_em),
  canceladoEm: data(r.cancelado_em),
});
const token = (r: Linha): TokenLogin => ({
  tokenHash: r.token_hash as string,
  email: r.email as string,
  voltar: (r.voltar as string | null) ?? null,
  criadoEm: data(r.criado_em)!,
  expiraEm: data(r.expira_em)!,
  usadoEm: data(r.usado_em),
});
const sessao = (r: Linha): Sessao => ({
  tokenHash: r.token_hash as string,
  usuarioId: r.usuario_id as string,
  contaId: (r.conta_id as string | null) ?? null,
  criadoEm: data(r.criado_em)!,
  expiraEm: data(r.expira_em)!,
  vistoEm: data(r.visto_em)!,
  aparelho: (r.aparelho as string | null) ?? null,
});
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Contas no PostgreSQL (migração 0007). */
export class RepositorioContasPostgres implements RepositorioContas {
  readonly tipo = 'postgres' as const;
  constructor(private readonly sql: Sql) {}

  async usuarioPorEmail(email: string) {
    const [r] = await this.sql`select * from usuarios where email = ${email}`;
    return r ? usuario(r) : null;
  }
  async usuarioPorId(id: string) {
    const [r] = await this.sql`select * from usuarios where id = ${id}`;
    return r ? usuario(r) : null;
  }
  async criarUsuario(d: { email: string; nome: string; senhaHash?: string | null; emailVerificadoEm?: Date | null }) {
    const [r] = await this.sql`
      insert into usuarios (email, nome, senha_hash, email_verificado_em)
      values (${d.email}, ${d.nome}, ${d.senhaHash ?? null}, ${iso(d.emailVerificadoEm)}::timestamptz) returning *`;
    return usuario(r!);
  }
  async atualizarUsuario(id: string, d: Partial<Pick<Usuario, 'nome' | 'senhaHash' | 'emailVerificadoEm'>>) {
    if (d.nome !== undefined) await this.sql`update usuarios set nome = ${d.nome} where id = ${id}`;
    if (d.senhaHash !== undefined) await this.sql`update usuarios set senha_hash = ${d.senhaHash} where id = ${id}`;
    if (d.emailVerificadoEm !== undefined) await this.sql`update usuarios set email_verificado_em = ${iso(d.emailVerificadoEm)}::timestamptz where id = ${id}`;
  }
  async contarUsuarios() {
    const [r] = await this.sql<{ n: number }[]>`select count(*)::int as n from usuarios`;
    return r!.n;
  }

  async criarConta(nome: string) {
    const [r] = await this.sql`insert into contas (nome) values (${nome}) returning *`;
    return conta(r!);
  }
  async conta(id: string) {
    const [r] = await this.sql`select * from contas where id = ${id}`;
    return r ? conta(r) : null;
  }
  async renomearConta(id: string, nome: string) {
    await this.sql`update contas set nome = ${nome} where id = ${id}`;
  }
  async lojas(contaId: string) {
    return (await this.sql`select * from conta_lojas where conta_id = ${contaId} order by nome`).map(loja);
  }
  async salvarLoja(l: Omit<LojaDaConta, 'verificadaEm'> & { verificadaEm?: Date | null }) {
    await this.sql`
      insert into conta_lojas (conta_id, loterica_codigo, nome, franquia_limite, verificada_em)
      values (${l.contaId}, ${l.codigo}, ${l.nome}, ${l.franquiaLimite}, ${iso(l.verificadaEm)}::timestamptz)
      on conflict (conta_id, loterica_codigo) do update set nome = excluded.nome, franquia_limite = excluded.franquia_limite
        ${l.verificadaEm !== undefined ? this.sql`, verificada_em = excluded.verificada_em` : this.sql``}`;
  }
  async removerLoja(contaId: string, codigo: string) {
    await this.sql`delete from conta_lojas where conta_id = ${contaId} and loterica_codigo = ${codigo}`;
  }

  async membros(contaId: string) {
    const rs = await this.sql`
      select m.*, u.id as u_id, u.email as u_email, u.nome as u_nome, u.senha_hash as u_senha_hash,
             u.email_verificado_em as u_email_verificado_em, u.criado_em as u_criado_em
      from membros m join usuarios u on u.id = m.usuario_id where m.conta_id = ${contaId} order by m.criado_em`;
    return rs.map((r) => ({
      ...membro(r),
      usuario: usuario({ id: r.u_id, email: r.u_email, nome: r.u_nome, senha_hash: r.u_senha_hash, email_verificado_em: r.u_email_verificado_em, criado_em: r.u_criado_em }),
    }));
  }
  async membro(contaId: string, usuarioId: string) {
    const [r] = await this.sql`select * from membros where conta_id = ${contaId} and usuario_id = ${usuarioId}`;
    return r ? membro(r) : null;
  }
  async contasDoUsuario(usuarioId: string) {
    const rs = await this.sql`
      select m.*, c.nome as c_nome, c.criado_em as c_criado_em from membros m join contas c on c.id = m.conta_id
      where m.usuario_id = ${usuarioId} order by m.criado_em`;
    return rs.map((r) => ({ conta: conta({ id: r.conta_id, nome: r.c_nome, criado_em: r.c_criado_em }), membro: membro(r) }));
  }
  async salvarMembro(m: Omit<Membro, 'criadoEm'>) {
    await this.sql`
      insert into membros (conta_id, usuario_id, papel, telas, lojas)
      values (${m.contaId}, ${m.usuarioId}, ${m.papel}, ${m.telas}, ${m.lojas})
      on conflict (conta_id, usuario_id) do update set papel = excluded.papel, telas = excluded.telas, lojas = excluded.lojas`;
  }
  async transferirResponsavel(contaId: string, de: string, para: string) {
    await this.sql.begin(async (tx) => {
      await tx`update membros set papel = 'socio' where conta_id = ${contaId} and usuario_id = ${de} and papel = 'responsavel'`;
      const r = await tx`update membros set papel = 'responsavel', telas = null, lojas = null where conta_id = ${contaId} and usuario_id = ${para} returning 1`;
      if (!r.length) throw new Error('membro não encontrado');
    });
  }
  async removerMembro(contaId: string, usuarioId: string) {
    await this.sql.begin(async (tx) => {
      await tx`delete from membros where conta_id = ${contaId} and usuario_id = ${usuarioId}`;
      await tx`update sessoes set conta_id = null where usuario_id = ${usuarioId} and conta_id = ${contaId}`;
    });
  }

  async criarConvite(c: Omit<Convite, 'id' | 'criadoEm' | 'aceitoEm' | 'canceladoEm'>) {
    const [r] = await this.sql`
      insert into convites (conta_id, email, papel, telas, lojas, token_hash, criado_por, expira_em)
      values (${c.contaId}, ${c.email}, ${c.papel}, ${c.telas}, ${c.lojas}, ${c.tokenHash}, ${c.criadoPor}, ${iso(c.expiraEm)}::timestamptz)
      returning *`;
    return convite(r!);
  }
  async convites(contaId: string) {
    return (await this.sql`select * from convites where conta_id = ${contaId} order by criado_em desc`).map(convite);
  }
  async convitePorToken(tokenHash: string) {
    const [r] = await this.sql`select * from convites where token_hash = ${tokenHash}`;
    return r ? convite(r) : null;
  }
  async marcarConvite(id: string, d: { aceitoEm?: Date; canceladoEm?: Date }) {
    if (d.aceitoEm) await this.sql`update convites set aceito_em = ${iso(d.aceitoEm)}::timestamptz where id = ${id}`;
    if (d.canceladoEm) await this.sql`update convites set cancelado_em = ${iso(d.canceladoEm)}::timestamptz where id = ${id}`;
  }

  async criarTokenLogin(t: Omit<TokenLogin, 'usadoEm' | 'criadoEm'> & { criadoEm: Date }) {
    await this.sql`
      insert into tokens_login (token_hash, email, voltar, criado_em, expira_em)
      values (${t.tokenHash}, ${t.email}, ${t.voltar}, ${iso(t.criadoEm)}::timestamptz, ${iso(t.expiraEm)}::timestamptz)`;
  }
  async usarTokenLogin(tokenHash: string, em: Date) {
    const [r] = await this.sql`update tokens_login set usado_em = ${iso(em)}::timestamptz where token_hash = ${tokenHash} and usado_em is null returning *`;
    return r ? token(r) : null;
  }
  async linksEnviados(email: string, desde: Date) {
    const rs = await this.sql`select criado_em from tokens_login where email = ${email} and criado_em >= ${iso(desde)}::timestamptz`;
    return rs.map((r) => data(r.criado_em)!);
  }

  async criarSessao(s: Sessao) {
    await this.sql`
      insert into sessoes (token_hash, usuario_id, conta_id, criado_em, expira_em, visto_em, aparelho)
      values (${s.tokenHash}, ${s.usuarioId}, ${s.contaId}, ${iso(s.criadoEm)}::timestamptz, ${iso(s.expiraEm)}::timestamptz, ${iso(s.vistoEm)}::timestamptz, ${s.aparelho})`;
  }
  async sessao(tokenHash: string) {
    const [r] = await this.sql`select * from sessoes where token_hash = ${tokenHash}`;
    return r ? sessao(r) : null;
  }
  async atualizarSessao(tokenHash: string, d: Partial<Pick<Sessao, 'contaId' | 'vistoEm' | 'expiraEm'>>) {
    if (d.contaId !== undefined) await this.sql`update sessoes set conta_id = ${d.contaId} where token_hash = ${tokenHash}`;
    if (d.vistoEm) await this.sql`update sessoes set visto_em = ${iso(d.vistoEm)}::timestamptz where token_hash = ${tokenHash}`;
    if (d.expiraEm) await this.sql`update sessoes set expira_em = ${iso(d.expiraEm)}::timestamptz where token_hash = ${tokenHash}`;
  }
  async encerrarSessao(tokenHash: string) {
    await this.sql`delete from sessoes where token_hash = ${tokenHash}`;
  }
  async encerrarSessoesDoUsuario(usuarioId: string, exceto?: string) {
    await this.sql`delete from sessoes where usuario_id = ${usuarioId} and token_hash <> ${exceto ?? ''}`;
  }
}
