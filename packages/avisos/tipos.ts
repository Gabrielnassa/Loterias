import type { Categoria, Papel, PreferenciasAparelho } from '@radar/core';

/** Fase 6: monitoradas, aparelhos (Web Push) e central de notificações. */
export interface Monitorada {
  contaId: string;
  codigo: string;
  apelido: string | null;
  criadoEm: Date;
}

export interface Aparelho {
  id: string;
  usuarioId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  nome: string | null;
  preferencias: PreferenciasAparelho;
  criadoEm: Date;
  vistoEm: Date;
  falhas: number;
  desativadoEm: Date | null;
}

export interface Notificacao {
  id: string;
  usuarioId: string;
  contaId: string | null;
  categoria: Categoria;
  titulo: string;
  corpo: string;
  url: string | null;
  chave: string;
  criadoEm: Date;
  lidaEm: Date | null;
  enviadas: number;
}

/** Membro da conta, para saber quem recebe cada alerta (tela e loja liberadas). */
export interface MembroDestino {
  usuarioId: string;
  papel: Papel;
  telas: string[] | null;
  lojas: string[] | null;
}

export interface CargaPush {
  titulo: string;
  corpo: string;
  url: string;
  chave: string;
  categoria: Categoria;
}

export type ResultadoPush = 'ok' | 'expirado' | 'falha';
export type EnviarPush = (a: Pick<Aparelho, 'endpoint' | 'p256dh' | 'auth'>, carga: CargaPush) => Promise<ResultadoPush>;

export interface RepositorioAvisos {
  readonly tipo: 'memoria' | 'postgres';
  monitoradas(contaId: string): Promise<Monitorada[]>;
  /** Para cada código monitorado, as contas que monitoram. */
  contasQueMonitoram(codigos?: readonly string[]): Promise<Map<string, string[]>>;
  monitorar(m: { contaId: string; codigo: string; apelido?: string | null }): Promise<void>;
  deixarDeMonitorar(contaId: string, codigo: string): Promise<void>;

  membrosDaConta(contaId: string): Promise<MembroDestino[]>;
  /** Contas que têm a loja (para alertas da própria lotérica). */
  contasComLoja(codigo: string): Promise<string[]>;
  /** Todas as pessoas com conta (resultados vão para todo mundo que quiser). */
  usuariosComConta(): Promise<{ usuarioId: string; contaId: string }[]>;

  aparelhos(usuarioId: string): Promise<Aparelho[]>;
  aparelhoPorEndpoint(endpoint: string): Promise<Aparelho | null>;
  /** Insere ou atualiza pela inscrição (endpoint); se o aparelho era de outra pessoa, passa a ser desta. */
  salvarAparelho(a: { usuarioId: string; endpoint: string; p256dh: string; auth: string; nome?: string | null; preferencias?: PreferenciasAparelho }): Promise<Aparelho>;
  preferenciasDoAparelho(id: string, usuarioId: string, p: PreferenciasAparelho): Promise<boolean>;
  removerAparelho(id: string, usuarioId: string): Promise<void>;
  registrarEnvio(id: string, r: ResultadoPush, em: Date): Promise<void>;

  /** null se a pessoa já recebeu esta `chave`. */
  criarNotificacao(n: Omit<Notificacao, 'id' | 'lidaEm' | 'enviadas'>): Promise<Notificacao | null>;
  notificacoes(usuarioId: string, limite?: number): Promise<Notificacao[]>;
  naoLidas(usuarioId: string): Promise<number>;
  marcarLidas(usuarioId: string, ids?: readonly string[]): Promise<void>;
  contarEnvio(notificacaoId: string, n: number): Promise<void>;
}
