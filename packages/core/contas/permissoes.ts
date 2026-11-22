/**
 * Contas (Fase 6): uma CONTA reúne as lotéricas de um dono e a equipe dele. Cada pessoa da equipe
 * tem um PAPEL e, para colaboradores, a lista de TELAS que pode abrir (e, opcionalmente, as lojas).
 *
 * - responsável: dono da conta; vê tudo, cuida da equipe, das lojas e do plano (cobrança).
 * - sócio: vê tudo (todas as telas e lojas) e cuida dos colaboradores; não mexe no plano nem em
 *   outros sócios ou no responsável.
 * - colaborador: só as telas (e lojas) que o responsável ou um sócio liberou.
 */
export const PAPEIS = ['responsavel', 'socio', 'colaborador'] as const;
export type Papel = (typeof PAPEIS)[number];

export const NOME_PAPEL: Record<Papel, string> = { responsavel: 'Responsável', socio: 'Sócio', colaborador: 'Colaborador' };

export type GrupoTela = 'Raio-X' | 'Mercado' | 'Minha lotérica' | 'Ferramentas' | 'Gestão da loja' | 'Conta';

export interface Tela {
  id: string;
  nome: string;
  grupo: GrupoTela;
  /** Páginas (prefixos) e APIs da tela. "/" casa só com a raiz. */
  rotas: string[];
  /** Telas de gestão da conta: nunca liberadas para colaborador. */
  soGestores?: 'equipe' | 'plano';
}

export const TELAS: readonly Tela[] = [
  { id: 'raio-x', nome: 'Raio-X de Abertura (início, ranking, Elite e Top, comparar, ao vivo, lotéricas)', grupo: 'Raio-X', rotas: ['/', '/aberturas', '/lotericas', '/ranking', '/elite', '/comparar', '/ao-vivo', '/api/aberturas', '/api/lotericas', '/api/ranking', '/api/raio-x', '/api/comparar', '/api/ao-vivo'] },
  { id: 'monitoradas', nome: 'Monitoradas e alertas da abertura', grupo: 'Raio-X', rotas: ['/monitoradas', '/api/monitoradas'] },
  { id: 'mercado', nome: 'Mercado (monitoramento, filas, estatísticas, Mega da Virada)', grupo: 'Mercado', rotas: ['/mercado', '/estatisticas', '/mega-da-virada', '/api/mercado', '/api/estatisticas', '/api/mega-da-virada'] },
  { id: 'minha-boloes', nome: 'Bolões MKP', grupo: 'Minha lotérica', rotas: ['/minha/boloes', '/api/minha/boloes'] },
  { id: 'minha-financeiro', nome: 'Financeiro MKP', grupo: 'Minha lotérica', rotas: ['/minha/financeiro', '/api/minha/financeiro'] },
  { id: 'minha-conferencia', nome: 'Conferência', grupo: 'Minha lotérica', rotas: ['/minha/conferencia', '/api/minha/conferencia'] },
  { id: 'minha-posicao', nome: 'Posição na abertura', grupo: 'Minha lotérica', rotas: ['/minha/posicao', '/api/minha/posicao'] },
  { id: 'minha-sugestoes', nome: 'Sugestões (franquia e formatos)', grupo: 'Minha lotérica', rotas: ['/minha/sugestoes', '/api/minha/sugestoes'] },
  { id: 'minha-simulador', nome: 'Simulador de posição', grupo: 'Minha lotérica', rotas: ['/minha/simulador', '/api/minha/simulador'] },
  { id: 'minha-cronometro', nome: 'Cronômetro da abertura', grupo: 'Minha lotérica', rotas: ['/minha/cronometro'] },
  { id: 'minha-site', nome: 'Meu site', grupo: 'Minha lotérica', rotas: ['/minha/site', '/api/minha/site'] },
  { id: 'minha-midias', nome: 'Mídias (artes)', grupo: 'Minha lotérica', rotas: ['/minha/midias', '/api/artes'] },
  { id: 'ferramentas', nome: 'Calendário, simulador de bolões e Loteca', grupo: 'Ferramentas', rotas: ['/calendario', '/simulador', '/loteca', '/api/calendario', '/api/simulador', '/api/loteca'] },
  { id: 'gestao-caixa', nome: 'Caixas (TFL e extras) e fechamento diário', grupo: 'Gestão da loja', rotas: ['/gestao/caixas', '/api/gestao/caixas'] },
  { id: 'gestao-fiados', nome: 'Fiados e cobrança diária', grupo: 'Gestão da loja', rotas: ['/gestao/fiados', '/api/gestao/fiados'] },
  { id: 'gestao-financeiro', nome: 'Fluxo de caixa, carro-forte, despesas e DRE', grupo: 'Gestão da loja', rotas: ['/gestao', '/api/gestao'] },
  { id: 'equipe', nome: 'Equipe e lojas da conta', grupo: 'Conta', rotas: ['/equipe', '/api/equipe'], soGestores: 'equipe' },
  { id: 'plano', nome: 'Plano e cobrança', grupo: 'Conta', rotas: ['/planos', '/api/planos'], soGestores: 'plano' },
];

/** Rotas que qualquer pessoa logada abre (o próprio perfil e as próprias notificações). */
export const ROTAS_LIVRES = ['/conta', '/notificacoes', '/sem-permissao', '/minha', '/api/conta', '/api/notificacoes', '/api/push'];

/** Rotas públicas (sem login): entrar, cadastro, convite, webhooks e o site público da lotérica. */
export const ROTAS_PUBLICAS = ['/entrar', '/cadastro', '/convite', '/api/auth', '/api/webhooks', '/api/site'];

export const TELAS_PADRAO_COLABORADOR = ['raio-x', 'minha-boloes', 'minha-conferencia', 'minha-cronometro', 'ferramentas', 'gestao-caixa', 'gestao-fiados'] as const;

const casa = (caminho: string, rota: string) => (rota === '/' ? caminho === '/' : caminho === rota || caminho.startsWith(`${rota}/`));

/** A tela de um caminho (a rota mais específica vence: /gestao/caixas antes de /gestao). */
export function telaDaRota(caminho: string): Tela | null {
  let melhor: { tela: Tela; tamanho: number } | null = null;
  for (const t of TELAS) {
    for (const r of t.rotas) {
      if (casa(caminho, r) && (!melhor || r.length > melhor.tamanho)) melhor = { tela: t, tamanho: r.length };
    }
  }
  return melhor?.tela ?? null;
}

export type AcessoRota = 'publica' | 'livre' | 'tela' | 'desconhecida';

/** Classifica um caminho: público, livre para quem está logado, de uma tela, ou desconhecido (site público, 404). */
export function classificarRota(caminho: string): { acesso: AcessoRota; tela: Tela | null } {
  if (ROTAS_PUBLICAS.some((r) => casa(caminho, r))) return { acesso: 'publica', tela: null };
  const tela = telaDaRota(caminho);
  // /minha exato só redireciona para a 1ª tela liberada; /api/minha/... já tem tela própria
  if (tela) return { acesso: 'tela', tela };
  if (ROTAS_LIVRES.some((r) => casa(caminho, r))) return { acesso: 'livre', tela: null };
  if (caminho.startsWith('/api/')) return { acesso: 'livre', tela: null };
  return { acesso: 'desconhecida', tela: null };
}

export interface MembroAcesso {
  papel: Papel;
  /** Telas liberadas (só vale para colaborador; null = padrão do papel). */
  telas?: readonly string[] | null;
  /** Lojas liberadas (só vale para colaborador; null = todas as lojas da conta). */
  lojas?: readonly string[] | null;
}

export function telasPadrao(papel: Papel): string[] {
  if (papel === 'colaborador') return [...TELAS_PADRAO_COLABORADOR];
  return TELAS.filter((t) => papel === 'responsavel' || t.soGestores !== 'plano').map((t) => t.id);
}

/** Telas que o membro abre de fato. Colaborador nunca abre equipe nem plano. */
export function telasEfetivas(m: MembroAcesso): string[] {
  if (m.papel !== 'colaborador') return telasPadrao(m.papel);
  const validas = new Set(TELAS.filter((t) => !t.soGestores).map((t) => t.id));
  return (m.telas ?? TELAS_PADRAO_COLABORADOR).filter((t) => validas.has(t));
}

export function podeAbrirTela(m: MembroAcesso, telaId: string): boolean {
  return telasEfetivas(m).includes(telaId);
}

/** Lojas da conta que o membro vê (colaborador pode ficar restrito a algumas). */
export function lojasVisiveis<T extends { codigo: string }>(m: MembroAcesso, lojasDaConta: readonly T[]): T[] {
  if (m.papel !== 'colaborador' || !m.lojas) return [...lojasDaConta];
  const ok = new Set(m.lojas);
  return lojasDaConta.filter((l) => ok.has(l.codigo));
}

/** Quem pode convidar quem. */
export function podeConvidar(ator: Papel, papel: Papel): boolean {
  if (ator === 'responsavel') return papel !== 'responsavel';
  if (ator === 'socio') return papel === 'colaborador';
  return false;
}

/** Quem pode alterar (papel, telas, lojas) ou remover quem. Ninguém mexe em si mesmo por aqui. */
export function podeGerenciarMembro(ator: { papel: Papel; usuarioId: string }, alvo: { papel: Papel; usuarioId: string }): boolean {
  if (ator.usuarioId === alvo.usuarioId) return false;
  if (ator.papel === 'responsavel') return true;
  if (ator.papel === 'socio') return alvo.papel === 'colaborador';
  return false;
}

/** Validação de uma mudança de papel: a conta fica sempre com exatamente 1 responsável. */
export function validarMudancaDePapel(ator: Papel, de: Papel, para: Papel): string | null {
  if (de === para) return null;
  if (de === 'responsavel') return 'o responsável não muda de papel por aqui: transfira a responsabilidade para outra pessoa';
  if (para === 'responsavel') return ator === 'responsavel' ? null : 'só o responsável transfere a responsabilidade';
  if (ator === 'socio' && para !== 'colaborador') return 'sócio só gerencia colaboradores';
  return null;
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizarEmail(email)) && email.length <= 254;
}

/** Senha: mínimo 8 caracteres, com letra e número. Devolve o problema ou null. */
export function problemaNaSenha(senha: string): string | null {
  if (senha.length < 8) return 'a senha precisa de pelo menos 8 caracteres';
  if (senha.length > 200) return 'senha longa demais';
  if (!/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) return 'use letras e números na senha';
  return null;
}

export const PRAZO_CONVITE_DIAS = 7;
export const PRAZO_LINK_MIN = 15;
export const PRAZO_SESSAO_DIAS = 30;
/** Links mágicos por e-mail por hora (anti-abuso). */
export const LINKS_POR_HORA = 5;

export type EstadoConvite = 'pendente' | 'aceito' | 'expirado' | 'cancelado';

export function estadoConvite(c: { expiraEm: Date; aceitoEm?: Date | null; canceladoEm?: Date | null }, agora: Date): EstadoConvite {
  if (c.canceladoEm) return 'cancelado';
  if (c.aceitoEm) return 'aceito';
  return c.expiraEm.getTime() <= agora.getTime() ? 'expirado' : 'pendente';
}

/** Pode mandar mais um link mágico para este e-mail? (máximo por hora) */
export function podeEnviarLink(enviadosEm: readonly Date[], agora: Date, maximo = LINKS_POR_HORA): boolean {
  const desde = agora.getTime() - 3_600_000;
  return enviadosEm.filter((d) => d.getTime() > desde).length < maximo;
}

/** Caminho de volta depois do login: só caminhos internos (evita redirecionamento aberto). */
export function voltaSegura(voltar: string | null | undefined): string {
  if (!voltar || !voltar.startsWith('/') || voltar.startsWith('//') || voltar.startsWith('/\\')) return '/';
  return voltar;
}
