import { lojasVisiveis, PRAZO_SESSAO_DIAS, telasEfetivas, type Papel } from '@radar/core';
import { hashToken } from './token';
import type { RepositorioContas, Sessao } from './tipos';

export const COOKIE_SESSAO = 'radar_sessao';
export const CABECALHO_CONTEXTO = 'x-radar-contexto';

/** O que cada tela precisa saber de quem está logado (montado pelo middleware a cada requisição). */
export interface ContextoSessao {
  usuario: { id: string; nome: string; email: string; temSenha: boolean };
  conta: { id: string; nome: string } | null;
  papel: Papel | null;
  /** Telas que a pessoa abre nesta conta. */
  telas: string[];
  /** Lojas da conta que a pessoa vê. */
  lojas: { codigo: string; nome: string; franquiaLimite: number }[];
  /** Todas as contas de que a pessoa participa (para trocar). */
  contas: { id: string; nome: string; papel: Papel }[];
}

/** Sessão válida -> contexto. Renova a validade (janela deslizante) se a sessão foi vista há mais de 10 min. */
export async function contextoDoToken(repo: RepositorioContas, token: string, agora: Date): Promise<ContextoSessao | null> {
  if (!token || token.length > 200) return null;
  const s = await repo.sessao(await hashToken(token));
  if (!s || s.expiraEm.getTime() <= agora.getTime()) return null;
  if (agora.getTime() - s.vistoEm.getTime() > 10 * 60_000) {
    await repo.atualizarSessao(s.tokenHash, { vistoEm: agora, expiraEm: new Date(agora.getTime() + PRAZO_SESSAO_DIAS * 86_400_000) });
  }
  return montarContexto(repo, s);
}

export async function montarContexto(repo: RepositorioContas, s: Pick<Sessao, 'usuarioId' | 'contaId'>): Promise<ContextoSessao | null> {
  const u = await repo.usuarioPorId(s.usuarioId);
  if (!u) return null;
  const contas = await repo.contasDoUsuario(u.id);
  const ativa = contas.find((c) => c.conta.id === s.contaId) ?? contas[0] ?? null;
  const lojas = ativa ? await repo.lojas(ativa.conta.id) : [];
  return {
    usuario: { id: u.id, nome: u.nome, email: u.email, temSenha: !!u.senhaHash },
    conta: ativa ? { id: ativa.conta.id, nome: ativa.conta.nome } : null,
    papel: ativa?.membro.papel ?? null,
    telas: ativa ? telasEfetivas(ativa.membro) : [],
    lojas: ativa ? lojasVisiveis(ativa.membro, lojas).map((l) => ({ codigo: l.codigo, nome: l.nome, franquiaLimite: l.franquiaLimite })) : [],
    contas: contas.map((c) => ({ id: c.conta.id, nome: c.conta.nome, papel: c.membro.papel })),
  };
}

/** Contexto <-> cabeçalho (base64 de JSON UTF-8; funciona no Node e no navegador). */
export function codificarContexto(c: ContextoSessao): string {
  let s = '';
  for (const b of new TextEncoder().encode(JSON.stringify(c))) s += String.fromCharCode(b);
  return btoa(s);
}

export function decodificarContexto(v: string | null | undefined): ContextoSessao | null {
  if (!v) return null;
  try {
    const bin = atob(v);
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))) as ContextoSessao;
  } catch {
    return null;
  }
}
