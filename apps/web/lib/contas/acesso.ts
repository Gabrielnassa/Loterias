import {
  assinaturaInicial,
  emailValido,
  normalizarCodigoLoterica,
  normalizarEmail,
  podeEnviarLink,
  PRAZO_LINK_MIN,
  PRAZO_SESSAO_DIAS,
  problemaNaSenha,
  voltaSegura,
} from '@radar/core';
import { enviarEmail, mostrarLinkNaTela } from '@/lib/email';
import { conferirSenha, hashSenha } from './senha';
import { estadoDoConvite } from './equipe';
import { hashToken, novoToken } from './token';
import type { RepositorioContas, Usuario } from './tipos';

/**
 * Entrar e sair (só no servidor): cadastro, link mágico por e-mail, senha, sessão e aceite de convite.
 * Nada revela se um e-mail tem conta ("se houver conta, mandamos o link").
 */
export class ErroAcesso extends Error {}

export interface ResultadoLink {
  /** Só em desenvolvimento sem SMTP: o link aparece na tela. */
  linkDev?: string;
}

/** Cria a sessão e devolve o token (vai no cookie; o banco guarda só o hash). */
export async function criarSessao(repo: RepositorioContas, usuarioId: string, contaId: string | null, agora: Date, aparelho: string | null): Promise<string> {
  const token = novoToken();
  await repo.criarSessao({
    tokenHash: await hashToken(token),
    usuarioId,
    contaId,
    criadoEm: agora,
    vistoEm: agora,
    expiraEm: new Date(agora.getTime() + PRAZO_SESSAO_DIAS * 86_400_000),
    aparelho: aparelho ? aparelho.slice(0, 160) : null,
  });
  return token;
}

async function mandarLink(repo: RepositorioContas, email: string, voltar: string, base: string, agora: Date, assunto: string, intro: string): Promise<ResultadoLink> {
  if (!podeEnviarLink(await repo.linksEnviados(email, new Date(agora.getTime() - 3_600_000)), agora)) return {};
  const token = novoToken();
  await repo.criarTokenLogin({ tokenHash: await hashToken(token), email, voltar, criadoEm: agora, expiraEm: new Date(agora.getTime() + PRAZO_LINK_MIN * 60_000) });
  const link = `${base}/api/auth/link?token=${encodeURIComponent(token)}`;
  await enviarEmail({ para: email, assunto, texto: `${intro}\n\n${link}\n\nO link vale por ${PRAZO_LINK_MIN} minutos e funciona uma vez só. Se não foi você, ignore este e-mail.` });
  return mostrarLinkNaTela() ? { linkDev: link } : {};
}

/** Pede um link de acesso. Se o e-mail não tem conta, não faz nada (e responde igual). */
export async function pedirLink(repo: RepositorioContas, d: { email: string; voltar?: string | null }, base: string, agora: Date): Promise<ResultadoLink> {
  const email = normalizarEmail(d.email);
  if (!emailValido(email)) throw new ErroAcesso('e-mail inválido');
  if (!(await repo.usuarioPorEmail(email))) return {};
  return mandarLink(repo, email, voltaSegura(d.voltar), base, agora, 'Seu link de acesso ao Radar Lotérico', 'Para entrar no Radar Lotérico, abra o link:');
}

/** Abre o link mágico: confirma o e-mail e cria a sessão. */
export async function usarLink(repo: RepositorioContas, token: string, agora: Date, aparelho: string | null): Promise<{ token: string; voltar: string }> {
  const t = await repo.usarTokenLogin(await hashToken(token), agora);
  if (!t || t.expiraEm.getTime() <= agora.getTime()) throw new ErroAcesso('link inválido ou vencido: peça outro');
  const u = await repo.usuarioPorEmail(t.email);
  if (!u) throw new ErroAcesso('link inválido');
  if (!u.emailVerificadoEm) await repo.atualizarUsuario(u.id, { emailVerificadoEm: agora });
  const contas = await repo.contasDoUsuario(u.id);
  return { token: await criarSessao(repo, u.id, contas[0]?.conta.id ?? null, agora, aparelho), voltar: voltaSegura(t.voltar) };
}

// tentativas de senha por e-mail (no processo): 10 em 15 min
const tentativas = new Map<string, number[]>();
function registrarTentativa(email: string, agora: Date): boolean {
  const desde = agora.getTime() - 15 * 60_000;
  const lista = (tentativas.get(email) ?? []).filter((t) => t > desde);
  lista.push(agora.getTime());
  tentativas.set(email, lista);
  return lista.length <= 10;
}

export async function entrarComSenha(repo: RepositorioContas, d: { email: string; senha: string }, agora: Date, aparelho: string | null): Promise<string> {
  const email = normalizarEmail(d.email);
  if (!registrarTentativa(email, agora)) throw new ErroAcesso('muitas tentativas: espere alguns minutos ou entre pelo link no e-mail');
  const u = await repo.usuarioPorEmail(email);
  const ok = await conferirSenha(d.senha, u?.senhaHash);
  if (!u || !ok) throw new ErroAcesso('e-mail ou senha não conferem');
  if (!u.emailVerificadoEm) throw new ErroAcesso('confirme o e-mail pelo link que mandamos antes de entrar com senha');
  const contas = await repo.contasDoUsuario(u.id);
  return criarSessao(repo, u.id, contas[0]?.conta.id ?? null, agora, aparelho);
}

export interface DadosCadastro {
  nome: string;
  email: string;
  senha?: string | null;
  empresa: string;
  /** Uma por linha: "código" ou "código=Nome". */
  lojas: string;
}

/** Lê "2894=Coli Loterias" (uma por linha ou vírgula). */
export function lerLojasDoFormulario(texto: string): { codigo: string; nome: string }[] {
  const out: { codigo: string; nome: string }[] = [];
  for (const parte of texto.split(/[\n,;]+/)) {
    const [c, ...n] = parte.split('=');
    if (!c?.trim()) continue;
    const codigo = normalizarCodigoLoterica(c.trim());
    if (!codigo) throw new ErroAcesso(`código de lotérica inválido: ${c.trim()}`);
    if (!out.some((x) => x.codigo === codigo)) out.push({ codigo, nome: n.join('=').trim() || `Lotérica ${codigo}` });
  }
  return out;
}

/**
 * Cadastro: cria a pessoa (responsável), a conta e as lojas, e manda o link que confirma o e-mail.
 * E-mail já cadastrado: só manda o link de acesso (sem dizer que já existia).
 */
export async function cadastrar(repo: RepositorioContas, d: DadosCadastro, base: string, agora: Date): Promise<ResultadoLink> {
  const email = normalizarEmail(d.email);
  const nome = d.nome.trim();
  const empresa = d.empresa.trim();
  if (!emailValido(email)) throw new ErroAcesso('e-mail inválido');
  if (nome.length < 2) throw new ErroAcesso('informe seu nome');
  if (empresa.length < 2) throw new ErroAcesso('informe o nome da empresa (conta)');
  if (d.senha) {
    const p = problemaNaSenha(d.senha);
    if (p) throw new ErroAcesso(p);
  }
  const lojas = lerLojasDoFormulario(d.lojas);
  if (!lojas.length) throw new ErroAcesso('informe o código de ao menos uma lotérica');
  if (await repo.usuarioPorEmail(email)) return pedirLink(repo, { email }, base, agora);
  const u = await repo.criarUsuario({ email, nome, senhaHash: d.senha ? await hashSenha(d.senha) : null });
  const conta = await repo.criarConta(empresa);
  for (const l of lojas) await repo.salvarLoja({ contaId: conta.id, codigo: l.codigo, nome: l.nome, franquiaLimite: 8000 });
  await repo.salvarMembro({ contaId: conta.id, usuarioId: u.id, papel: 'responsavel', telas: null, lojas: null });
  await repo.salvarAssinatura(assinaturaInicial(conta.id, agora));
  return mandarLink(repo, email, '/', base, agora, 'Confirme seu e-mail no Radar Lotérico', `Olá, ${nome}! Para confirmar o e-mail e entrar na conta "${empresa}", abra o link:`);
}

/** Troca a senha (ou define a primeira). Encerra as outras sessões. */
export async function definirSenha(repo: RepositorioContas, u: Pick<Usuario, 'id'>, d: { atual?: string | null; nova: string }, sessaoAtual: string | null): Promise<void> {
  const usuario = await repo.usuarioPorId(u.id);
  if (!usuario) throw new ErroAcesso('usuário não encontrado');
  if (usuario.senhaHash && !(await conferirSenha(d.atual ?? '', usuario.senhaHash))) throw new ErroAcesso('a senha atual não confere');
  const p = problemaNaSenha(d.nova);
  if (p) throw new ErroAcesso(p);
  await repo.atualizarUsuario(u.id, { senhaHash: await hashSenha(d.nova) });
  await repo.encerrarSessoesDoUsuario(u.id, sessaoAtual ? await hashToken(sessaoAtual) : undefined);
}

/**
 * Aceita um convite. Logado com o e-mail do convite: entra na conta. Sem login e sem cadastro: cria a
 * pessoa (o token do convite prova o e-mail) e já entra. Com cadastro mas sem login: precisa entrar antes.
 */
export async function aceitarConvite(
  repo: RepositorioContas,
  d: { token: string; logado?: { id: string; email: string } | null; nome?: string | null; senha?: string | null },
  agora: Date,
  aparelho: string | null,
): Promise<{ sessao: string | null; contaId: string }> {
  const c = await repo.convitePorToken(await hashToken(d.token));
  if (!c) throw new ErroAcesso('convite não encontrado');
  const estado = estadoDoConvite(c, agora);
  if (estado !== 'pendente') throw new ErroAcesso(estado === 'aceito' ? 'este convite já foi usado' : estado === 'cancelado' ? 'este convite foi cancelado' : 'este convite venceu: peça outro');
  let usuario = await repo.usuarioPorEmail(c.email);
  let sessao: string | null = null;
  if (d.logado) {
    if (d.logado.email !== c.email) throw new ErroAcesso(`este convite é para ${c.email}: saia e entre com esse e-mail`);
    usuario = await repo.usuarioPorId(d.logado.id);
  } else if (usuario) {
    throw new ErroAcesso('você já tem cadastro: entre com seu e-mail para aceitar');
  } else {
    const nome = (d.nome ?? '').trim();
    if (nome.length < 2) throw new ErroAcesso('informe seu nome');
    if (d.senha) {
      const p = problemaNaSenha(d.senha);
      if (p) throw new ErroAcesso(p);
    }
    usuario = await repo.criarUsuario({ email: c.email, nome, senhaHash: d.senha ? await hashSenha(d.senha) : null, emailVerificadoEm: agora });
  }
  if (!usuario) throw new ErroAcesso('usuário não encontrado');
  if (!(await repo.membro(c.contaId, usuario.id))) {
    await repo.salvarMembro({ contaId: c.contaId, usuarioId: usuario.id, papel: c.papel, telas: c.telas, lojas: c.lojas });
  }
  await repo.marcarConvite(c.id, { aceitoEm: agora });
  if (!d.logado) sessao = await criarSessao(repo, usuario.id, c.contaId, agora, aparelho);
  return { sessao, contaId: c.contaId };
}

/** Troca a conta ativa da sessão (para quem participa de mais de uma). */
export async function trocarConta(repo: RepositorioContas, token: string, usuarioId: string, contaId: string): Promise<void> {
  if (!(await repo.membro(contaId, usuarioId))) throw new ErroAcesso('você não participa desta conta');
  await repo.atualizarSessao(await hashToken(token), { contaId });
}

export async function sair(repo: RepositorioContas, token: string | null | undefined): Promise<void> {
  if (token) await repo.encerrarSessao(await hashToken(token));
}
