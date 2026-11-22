import type { Papel, PlanoId, StatusAssinatura } from '@radar/core';
import type { Sql } from '@radar/db';
import type { Assinatura, Cobranca, Conta, Convite, LojaDaConta, Membro, RepositorioContas, Sessao, TokenLogin, Usuario } from './tipos';

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
const assinatura = (r: Linha): Assinatura => ({
  contaId: r.conta_id as string,
  plano: r.plano as PlanoId,
  status: r.status as StatusAssinatura,
  testeAte: data(r.teste_ate),
  pagoAte: data(r.pago_ate),
  forma: (r.forma as Assinatura['forma']) ?? null,
  valor: r.valor === null || r.valor === undefined ? null : Number(r.valor),
  asaasClienteId: (r.asaas_cliente_id as string | null) ?? null,
  asaasAssinaturaId: (r.asaas_assinatura_id as string | null) ?? null,
  canceladaEm: data(r.cancelada_em),
});
const cobranca = (r: Linha): Cobranca => ({
  id: r.id as string,
  contaId: r.conta_id as string,
  asaasAssinaturaId: (r.asaas_assinatura_id as string | null) ?? null,
  valor: Number(r.valor),
  vencimento: typeof r.vencimento === 'string' ? r.vencimento.slice(0, 10) : (r.vencimento as Date).toISOString().slice(0, 10),
  status: r.status as string,
  forma: (r.forma as string | null) ?? null,
  link: (r.link as string | null) ?? null,
  pagoEm: data(r.pago_em),
});

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

  async assinatura(contaId: string) {
    const [r] = await this.sql`select * from assinaturas where conta_id = ${contaId}`;
    return r ? assinatura(r) : null;
  }
  async salvarAssinatura(a: Assinatura) {
    await this.sql`
      insert into assinaturas (conta_id, plano, status, teste_ate, pago_ate, forma, valor, asaas_cliente_id, asaas_assinatura_id, cancelada_em, atualizado_em)
      values (${a.contaId}, ${a.plano}, ${a.status}, ${iso(a.testeAte)}::timestamptz, ${iso(a.pagoAte)}::timestamptz, ${a.forma}, ${a.valor},
              ${a.asaasClienteId}, ${a.asaasAssinaturaId}, ${iso(a.canceladaEm)}::timestamptz, now())
      on conflict (conta_id) do update set plano = excluded.plano, status = excluded.status, teste_ate = excluded.teste_ate,
        pago_ate = excluded.pago_ate, forma = excluded.forma, valor = excluded.valor, asaas_cliente_id = excluded.asaas_cliente_id,
        asaas_assinatura_id = excluded.asaas_assinatura_id, cancelada_em = excluded.cancelada_em, atualizado_em = now()`;
  }
  async contaPorAssinaturaAsaas(asaasAssinaturaId: string) {
    const [r] = await this.sql`select conta_id from assinaturas where asaas_assinatura_id = ${asaasAssinaturaId}`;
    return r ? (r.conta_id as string) : null;
  }
  async cobrancas(contaId: string) {
    return (await this.sql`select * from cobrancas where conta_id = ${contaId} order by vencimento desc, atualizado_em desc limit 50`).map(cobranca);
  }
  async salvarCobranca(c: Cobranca) {
    await this.sql`
      insert into cobrancas (id, conta_id, asaas_assinatura_id, valor, vencimento, status, forma, link, pago_em, atualizado_em)
      values (${c.id}, ${c.contaId}, ${c.asaasAssinaturaId}, ${c.valor}, ${c.vencimento}::date, ${c.status}, ${c.forma}, ${c.link}, ${iso(c.pagoEm)}::timestamptz, now())
      on conflict (id) do update set valor = excluded.valor, vencimento = excluded.vencimento, status = excluded.status, forma = excluded.forma,
        link = coalesce(excluded.link, cobrancas.link), pago_em = coalesce(excluded.pago_em, cobrancas.pago_em), atualizado_em = now()`;
  }
  async registrarWebhook(chave: string, evento: string, corpo: unknown) {
    const r = await this.sql`
      insert into webhooks_asaas (chave, evento, corpo) values (${chave}, ${evento}, ${this.sql.json(corpo as Parameters<Sql['json']>[0])})
      on conflict (chave) do nothing returning 1`;
    return r.length > 0;
  }
  async marcarWebhook(chave: string, erro: string | null) {
    await this.sql`update webhooks_asaas set processado_em = now(), erro = ${erro} where chave = ${chave}`;
  }
  async contarPessoas(contaId: string, agora: Date) {
    const [r] = await this.sql<{ n: number }[]>`
      select (select count(*) from membros where conta_id = ${contaId})
           + (select count(*) from convites where conta_id = ${contaId} and aceito_em is null and cancelado_em is null and expira_em > ${iso(agora)}::timestamptz) as n`;
    return Number(r!.n);
  }
}
