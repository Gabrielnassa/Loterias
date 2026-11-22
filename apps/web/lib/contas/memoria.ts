import type { Assinatura, Cobranca, Conta, Convite, LojaDaConta, Membro, RepositorioContas, Sessao, TokenLogin, Usuario } from './tipos';

/** Estado serializável (a demonstração guarda no localStorage do navegador). */
export interface EstadoContas {
  usuarios: Usuario[];
  contas: Conta[];
  lojas: LojaDaConta[];
  membros: Membro[];
  convites: Convite[];
  tokens: TokenLogin[];
  sessoes: Sessao[];
  assinaturas?: Assinatura[];
  cobrancas?: Cobranca[];
  webhooks?: { chave: string; evento: string; recebidoEm: Date; erro: string | null }[];
}

export const estadoVazio = (): EstadoContas => ({ usuarios: [], contas: [], lojas: [], membros: [], convites: [], tokens: [], sessoes: [] });

const DATAS = new Set(['criadoEm', 'emailVerificadoEm', 'verificadaEm', 'expiraEm', 'aceitoEm', 'canceladoEm', 'usadoEm', 'vistoEm', 'testeAte', 'pagoAte', 'canceladaEm', 'pagoEm', 'recebidoEm']);

/** JSON -> estado (datas voltam a ser Date). */
export function lerEstadoContas(json: string): EstadoContas {
  return JSON.parse(json, (k, v) => (DATAS.has(k) && typeof v === 'string' ? new Date(v) : v)) as EstadoContas;
}

const novoId = () => globalThis.crypto.randomUUID();
const copia = <T>(x: T): T => ({ ...x });

export class RepositorioContasMemoria implements RepositorioContas {
  readonly tipo = 'memoria' as const;
  constructor(
    readonly estado: EstadoContas = estadoVazio(),
    private readonly aoMudar: (e: EstadoContas) => void = () => {},
  ) {}

  private mudou() {
    this.aoMudar(this.estado);
  }

  async usuarioPorEmail(email: string) {
    const u = this.estado.usuarios.find((x) => x.email === email);
    return u ? copia(u) : null;
  }
  async usuarioPorId(id: string) {
    const u = this.estado.usuarios.find((x) => x.id === id);
    return u ? copia(u) : null;
  }
  async criarUsuario(d: { email: string; nome: string; senhaHash?: string | null; emailVerificadoEm?: Date | null }) {
    if (this.estado.usuarios.some((x) => x.email === d.email)) throw new Error('e-mail já cadastrado');
    const u: Usuario = { id: novoId(), email: d.email, nome: d.nome, senhaHash: d.senhaHash ?? null, emailVerificadoEm: d.emailVerificadoEm ?? null, criadoEm: new Date() };
    this.estado.usuarios.push(u);
    this.mudou();
    return copia(u);
  }
  async atualizarUsuario(id: string, d: Partial<Pick<Usuario, 'nome' | 'senhaHash' | 'emailVerificadoEm'>>) {
    const u = this.estado.usuarios.find((x) => x.id === id);
    if (u) Object.assign(u, d);
    this.mudou();
  }
  async contarUsuarios() {
    return this.estado.usuarios.length;
  }

  async criarConta(nome: string) {
    const c: Conta = { id: novoId(), nome, criadoEm: new Date() };
    this.estado.contas.push(c);
    this.mudou();
    return copia(c);
  }
  async conta(id: string) {
    const c = this.estado.contas.find((x) => x.id === id);
    return c ? copia(c) : null;
  }
  async renomearConta(id: string, nome: string) {
    const c = this.estado.contas.find((x) => x.id === id);
    if (c) c.nome = nome;
    this.mudou();
  }
  async lojas(contaId: string) {
    return this.estado.lojas.filter((l) => l.contaId === contaId).sort((a, b) => a.nome.localeCompare(b.nome)).map(copia);
  }
  async salvarLoja(l: Omit<LojaDaConta, 'verificadaEm'> & { verificadaEm?: Date | null }) {
    const atual = this.estado.lojas.find((x) => x.contaId === l.contaId && x.codigo === l.codigo);
    if (atual) Object.assign(atual, { nome: l.nome, franquiaLimite: l.franquiaLimite, ...(l.verificadaEm !== undefined ? { verificadaEm: l.verificadaEm } : {}) });
    else this.estado.lojas.push({ ...l, verificadaEm: l.verificadaEm ?? null });
    this.mudou();
  }
  async removerLoja(contaId: string, codigo: string) {
    this.estado.lojas = this.estado.lojas.filter((x) => !(x.contaId === contaId && x.codigo === codigo));
    this.mudou();
  }

  async membros(contaId: string) {
    return this.estado.membros
      .filter((m) => m.contaId === contaId)
      .map((m) => ({ ...m, usuario: copia(this.estado.usuarios.find((u) => u.id === m.usuarioId)!) }))
      .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
  }
  async membro(contaId: string, usuarioId: string) {
    const m = this.estado.membros.find((x) => x.contaId === contaId && x.usuarioId === usuarioId);
    return m ? copia(m) : null;
  }
  async contasDoUsuario(usuarioId: string) {
    return this.estado.membros
      .filter((m) => m.usuarioId === usuarioId)
      .map((m) => ({ conta: copia(this.estado.contas.find((c) => c.id === m.contaId)!), membro: copia(m) }))
      .sort((a, b) => a.membro.criadoEm.getTime() - b.membro.criadoEm.getTime());
  }
  async salvarMembro(m: Omit<Membro, 'criadoEm'>) {
    const atual = this.estado.membros.find((x) => x.contaId === m.contaId && x.usuarioId === m.usuarioId);
    if (m.papel === 'responsavel' && this.estado.membros.some((x) => x.contaId === m.contaId && x.papel === 'responsavel' && x.usuarioId !== m.usuarioId)) {
      throw new Error('a conta já tem um responsável');
    }
    if (atual) Object.assign(atual, { papel: m.papel, telas: m.telas, lojas: m.lojas });
    else this.estado.membros.push({ ...m, criadoEm: new Date() });
    this.mudou();
  }
  async transferirResponsavel(contaId: string, de: string, para: string) {
    const a = this.estado.membros.find((x) => x.contaId === contaId && x.usuarioId === de);
    const b = this.estado.membros.find((x) => x.contaId === contaId && x.usuarioId === para);
    if (!a || !b) throw new Error('membro não encontrado');
    a.papel = 'socio';
    Object.assign(b, { papel: 'responsavel', telas: null, lojas: null });
    this.mudou();
  }
  async removerMembro(contaId: string, usuarioId: string) {
    this.estado.membros = this.estado.membros.filter((x) => !(x.contaId === contaId && x.usuarioId === usuarioId));
    this.estado.sessoes = this.estado.sessoes.map((s) => (s.usuarioId === usuarioId && s.contaId === contaId ? { ...s, contaId: null } : s));
    this.mudou();
  }

  async criarConvite(c: Omit<Convite, 'id' | 'criadoEm' | 'aceitoEm' | 'canceladoEm'>) {
    const novo: Convite = { ...c, id: novoId(), criadoEm: new Date(), aceitoEm: null, canceladoEm: null };
    this.estado.convites.push(novo);
    this.mudou();
    return copia(novo);
  }
  async convites(contaId: string) {
    return this.estado.convites.filter((c) => c.contaId === contaId).sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime()).map(copia);
  }
  async convitePorToken(tokenHash: string) {
    const c = this.estado.convites.find((x) => x.tokenHash === tokenHash);
    return c ? copia(c) : null;
  }
  async marcarConvite(id: string, d: { aceitoEm?: Date; canceladoEm?: Date }) {
    const c = this.estado.convites.find((x) => x.id === id);
    if (c) Object.assign(c, d);
    this.mudou();
  }

  async criarTokenLogin(t: Omit<TokenLogin, 'usadoEm' | 'criadoEm'> & { criadoEm: Date }) {
    this.estado.tokens.push({ ...t, usadoEm: null });
    this.mudou();
  }
  async usarTokenLogin(tokenHash: string, em: Date) {
    const t = this.estado.tokens.find((x) => x.tokenHash === tokenHash);
    if (!t || t.usadoEm) return null;
    t.usadoEm = em;
    this.mudou();
    return copia(t);
  }
  async linksEnviados(email: string, desde: Date) {
    return this.estado.tokens.filter((t) => t.email === email && t.criadoEm.getTime() >= desde.getTime()).map((t) => t.criadoEm);
  }

  async criarSessao(s: Sessao) {
    this.estado.sessoes.push(copia(s));
    this.mudou();
  }
  async sessao(tokenHash: string) {
    const s = this.estado.sessoes.find((x) => x.tokenHash === tokenHash);
    return s ? copia(s) : null;
  }
  async atualizarSessao(tokenHash: string, d: Partial<Pick<Sessao, 'contaId' | 'vistoEm' | 'expiraEm'>>) {
    const s = this.estado.sessoes.find((x) => x.tokenHash === tokenHash);
    if (s) Object.assign(s, d);
    this.mudou();
  }
  async encerrarSessao(tokenHash: string) {
    this.estado.sessoes = this.estado.sessoes.filter((x) => x.tokenHash !== tokenHash);
    this.mudou();
  }
  async encerrarSessoesDoUsuario(usuarioId: string, exceto?: string) {
    this.estado.sessoes = this.estado.sessoes.filter((x) => x.usuarioId !== usuarioId || x.tokenHash === exceto);
    this.mudou();
  }

  async assinatura(contaId: string) {
    const a = (this.estado.assinaturas ?? []).find((x) => x.contaId === contaId);
    return a ? copia(a) : null;
  }
  async salvarAssinatura(a: Assinatura) {
    this.estado.assinaturas = [...(this.estado.assinaturas ?? []).filter((x) => x.contaId !== a.contaId), copia(a)];
    this.mudou();
  }
  async contaPorAssinaturaAsaas(asaasAssinaturaId: string) {
    return (this.estado.assinaturas ?? []).find((x) => x.asaasAssinaturaId === asaasAssinaturaId)?.contaId ?? null;
  }
  async cobrancas(contaId: string) {
    return (this.estado.cobrancas ?? []).filter((c) => c.contaId === contaId).sort((a, b) => (a.vencimento < b.vencimento ? 1 : -1)).map(copia);
  }
  async salvarCobranca(c: Cobranca) {
    this.estado.cobrancas = [...(this.estado.cobrancas ?? []).filter((x) => x.id !== c.id), copia(c)];
    this.mudou();
  }
  async registrarWebhook(chave: string, evento: string) {
    const lista = (this.estado.webhooks ??= []);
    if (lista.some((w) => w.chave === chave)) return false;
    lista.push({ chave, evento, recebidoEm: new Date(), erro: null });
    this.mudou();
    return true;
  }
  async marcarWebhook(chave: string, erro: string | null) {
    const w = (this.estado.webhooks ?? []).find((x) => x.chave === chave);
    if (w) w.erro = erro;
    this.mudou();
  }
  async contarPessoas(contaId: string, agora: Date) {
    const membros = this.estado.membros.filter((m) => m.contaId === contaId).length;
    const convites = this.estado.convites.filter((c) => c.contaId === contaId && !c.aceitoEm && !c.canceladoEm && c.expiraEm.getTime() > agora.getTime()).length;
    return membros + convites;
  }
}
