import type { Assinatura, Papel } from '@radar/core';

export type { Assinatura };

/** Fase 6: tipos e repositório de contas (Postgres em produção; memória em dev sem banco e na demonstração). */
export interface Usuario {
  id: string;
  email: string;
  nome: string;
  senhaHash: string | null;
  emailVerificadoEm: Date | null;
  criadoEm: Date;
}

export interface Conta {
  id: string;
  nome: string;
  criadoEm: Date;
}

export interface LojaDaConta {
  contaId: string;
  codigo: string;
  nome: string;
  franquiaLimite: number;
  verificadaEm: Date | null;
}

export interface Membro {
  contaId: string;
  usuarioId: string;
  papel: Papel;
  telas: string[] | null;
  lojas: string[] | null;
  criadoEm: Date;
}

export interface Convite {
  id: string;
  contaId: string;
  email: string;
  papel: Exclude<Papel, 'responsavel'>;
  telas: string[] | null;
  lojas: string[] | null;
  tokenHash: string;
  criadoPor: string | null;
  criadoEm: Date;
  expiraEm: Date;
  aceitoEm: Date | null;
  canceladoEm: Date | null;
}

export interface TokenLogin {
  tokenHash: string;
  email: string;
  voltar: string | null;
  criadoEm: Date;
  expiraEm: Date;
  usadoEm: Date | null;
}

export interface Sessao {
  tokenHash: string;
  usuarioId: string;
  contaId: string | null;
  criadoEm: Date;
  expiraEm: Date;
  vistoEm: Date;
  aparelho: string | null;
}

/** Cobrança (pagamento) do Asaas, espelhada no banco. */
export interface Cobranca {
  id: string;
  contaId: string;
  asaasAssinaturaId: string | null;
  valor: number;
  /** AAAA-MM-DD */
  vencimento: string;
  status: string;
  forma: string | null;
  link: string | null;
  pagoEm: Date | null;
}

/** Chave da API pública (só o hash fica guardado). */
export interface ChaveApi {
  id: string;
  contaId: string;
  nome: string;
  prefixo: string;
  hash: string;
  criadoPor: string | null;
  criadoEm: Date;
  ultimoUsoEm: Date | null;
  revogadaEm: Date | null;
}

export interface RepositorioContas {
  readonly tipo: 'memoria' | 'postgres';
  usuarioPorEmail(email: string): Promise<Usuario | null>;
  usuarioPorId(id: string): Promise<Usuario | null>;
  criarUsuario(d: { email: string; nome: string; senhaHash?: string | null; emailVerificadoEm?: Date | null }): Promise<Usuario>;
  atualizarUsuario(id: string, d: Partial<Pick<Usuario, 'nome' | 'senhaHash' | 'emailVerificadoEm'>>): Promise<void>;
  contarUsuarios(): Promise<number>;

  criarConta(nome: string): Promise<Conta>;
  conta(id: string): Promise<Conta | null>;
  renomearConta(id: string, nome: string): Promise<void>;
  lojas(contaId: string): Promise<LojaDaConta[]>;
  salvarLoja(l: Omit<LojaDaConta, 'verificadaEm'> & { verificadaEm?: Date | null }): Promise<void>;
  removerLoja(contaId: string, codigo: string): Promise<void>;

  membros(contaId: string): Promise<(Membro & { usuario: Usuario })[]>;
  membro(contaId: string, usuarioId: string): Promise<Membro | null>;
  contasDoUsuario(usuarioId: string): Promise<{ conta: Conta; membro: Membro }[]>;
  /** Insere ou atualiza (papel, telas, lojas). */
  salvarMembro(m: Omit<Membro, 'criadoEm'>): Promise<void>;
  /** Passa a responsabilidade: `de` vira sócio e `para` vira responsável (atômico). */
  transferirResponsavel(contaId: string, de: string, para: string): Promise<void>;
  removerMembro(contaId: string, usuarioId: string): Promise<void>;

  criarConvite(c: Omit<Convite, 'id' | 'criadoEm' | 'aceitoEm' | 'canceladoEm'>): Promise<Convite>;
  convites(contaId: string): Promise<Convite[]>;
  convitePorToken(tokenHash: string): Promise<Convite | null>;
  marcarConvite(id: string, d: { aceitoEm?: Date; canceladoEm?: Date }): Promise<void>;

  criarTokenLogin(t: Omit<TokenLogin, 'usadoEm' | 'criadoEm'> & { criadoEm: Date }): Promise<void>;
  /** Marca o token como usado e o devolve (só uma vez; null se não existe ou já foi usado). */
  usarTokenLogin(tokenHash: string, em: Date): Promise<TokenLogin | null>;
  linksEnviados(email: string, desde: Date): Promise<Date[]>;

  criarSessao(s: Sessao): Promise<void>;
  sessao(tokenHash: string): Promise<Sessao | null>;
  atualizarSessao(tokenHash: string, d: Partial<Pick<Sessao, 'contaId' | 'vistoEm' | 'expiraEm'>>): Promise<void>;
  encerrarSessao(tokenHash: string): Promise<void>;
  encerrarSessoesDoUsuario(usuarioId: string, exceto?: string): Promise<void>;

  // planos e cobrança (Fase 6.3)
  assinatura(contaId: string): Promise<Assinatura | null>;
  salvarAssinatura(a: Assinatura): Promise<void>;
  contaPorAssinaturaAsaas(asaasAssinaturaId: string): Promise<string | null>;
  cobrancas(contaId: string): Promise<Cobranca[]>;
  salvarCobranca(c: Cobranca): Promise<void>;
  /** false se o evento já tinha chegado (o Asaas reenvia). */
  registrarWebhook(chave: string, evento: string, corpo: unknown): Promise<boolean>;
  marcarWebhook(chave: string, erro: string | null): Promise<void>;
  /** Quantas pessoas e convites pendentes a conta tem (limite do plano). */
  contarPessoas(contaId: string, agora: Date): Promise<number>;

  // chaves da API pública (plugin WordPress)
  criarChaveApi(c: Omit<ChaveApi, 'id' | 'criadoEm' | 'ultimoUsoEm' | 'revogadaEm'>): Promise<ChaveApi>;
  chavesApi(contaId: string): Promise<ChaveApi[]>;
  chaveApiPorHash(hash: string): Promise<ChaveApi | null>;
  usarChaveApi(id: string, em: Date): Promise<void>;
  revogarChaveApi(contaId: string, id: string, em: Date): Promise<void>;
}
