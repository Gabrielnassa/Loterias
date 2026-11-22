import {
  emailValido,
  estadoConvite,
  normalizarCodigoLoterica,
  normalizarEmail,
  PAPEIS,
  podeConvidar,
  podeGerenciarMembro,
  PRAZO_CONVITE_DIAS,
  TELAS,
  validarMudancaDePapel,
  NOME_PAPEL,
  type EstadoConvite,
  type Papel,
} from '@radar/core';
import { enviarEmail } from '@/lib/email';
import type { ContextoSessao } from './sessao';
import { hashToken, novoToken } from './token';
import type { Convite, RepositorioContas } from './tipos';

/**
 * Equipe e lojas da conta: convidar, mudar papel/telas/lojas, remover, lojas e nome da conta.
 * Roda no servidor e na demonstração (Web Crypto; o e-mail é trocado por um aviso na demo).
 */
export class ErroEquipe extends Error {}

export const estadoDoConvite = (c: Pick<Convite, 'expiraEm' | 'aceitoEm' | 'canceladoEm'>, agora: Date): EstadoConvite => estadoConvite(c, agora);

function exigirConta(ctx: ContextoSessao | null): asserts ctx is ContextoSessao & { conta: { id: string; nome: string }; papel: Papel } {
  if (!ctx?.conta || !ctx.papel) throw new ErroEquipe('entre numa conta primeiro');
}

const telasValidas = (v: readonly string[] | null | undefined) => (v ? v.filter((t) => TELAS.some((x) => x.id === t && !x.soGestores)) : null);

async function lojasValidas(repo: RepositorioContas, contaId: string, v: readonly string[] | null | undefined): Promise<string[] | null> {
  if (!v || !v.length) return null;
  const da = new Set((await repo.lojas(contaId)).map((l) => l.codigo));
  const ok = v.filter((c) => da.has(c));
  return ok.length ? ok : null;
}

export interface DadosConvite {
  email: string;
  papel: string;
  telas?: string[] | null;
  lojas?: string[] | null;
}

/** Cria o convite e manda o e-mail. Devolve o link (a tela mostra para copiar e mandar pelo WhatsApp). */
export async function convidar(repo: RepositorioContas, ctx: ContextoSessao | null, d: DadosConvite, base: string, agora: Date): Promise<{ link: string; convite: Convite }> {
  exigirConta(ctx);
  const email = normalizarEmail(d.email);
  if (!emailValido(email)) throw new ErroEquipe('e-mail inválido');
  const papel = d.papel as Papel;
  if (!PAPEIS.includes(papel) || papel === 'responsavel') throw new ErroEquipe('papel inválido');
  if (!podeConvidar(ctx.papel, papel)) throw new ErroEquipe(`${NOME_PAPEL[ctx.papel]} não pode convidar ${NOME_PAPEL[papel].toLowerCase()}`);
  const existente = await repo.usuarioPorEmail(email);
  if (existente && (await repo.membro(ctx.conta.id, existente.id))) throw new ErroEquipe('esta pessoa já faz parte da conta');
  const pendente = (await repo.convites(ctx.conta.id)).find((c) => c.email === email && estadoDoConvite(c, agora) === 'pendente');
  if (pendente) await repo.marcarConvite(pendente.id, { canceladoEm: agora });
  const token = novoToken();
  const convite = await repo.criarConvite({
    contaId: ctx.conta.id,
    email,
    papel,
    telas: papel === 'colaborador' ? telasValidas(d.telas) : null,
    lojas: papel === 'colaborador' ? await lojasValidas(repo, ctx.conta.id, d.lojas) : null,
    tokenHash: await hashToken(token),
    criadoPor: ctx.usuario.id,
    expiraEm: new Date(agora.getTime() + PRAZO_CONVITE_DIAS * 86_400_000),
  });
  const link = `${base}/convite/${token}`;
  await enviarEmail({
    para: email,
    assunto: `${ctx.usuario.nome} convidou você para "${ctx.conta.nome}" no Radar Lotérico`,
    texto: `${ctx.usuario.nome} convidou você para a equipe de "${ctx.conta.nome}" como ${NOME_PAPEL[papel].toLowerCase()}.\n\nPara aceitar, abra o link (vale por ${PRAZO_CONVITE_DIAS} dias):\n${link}`,
  });
  return { link, convite };
}

export async function cancelarConvite(repo: RepositorioContas, ctx: ContextoSessao | null, id: string, agora: Date): Promise<void> {
  exigirConta(ctx);
  const c = (await repo.convites(ctx.conta.id)).find((x) => x.id === id);
  if (!c) throw new ErroEquipe('convite não encontrado');
  if (!podeConvidar(ctx.papel, c.papel)) throw new ErroEquipe('você não pode cancelar este convite');
  await repo.marcarConvite(id, { canceladoEm: agora });
}

export interface DadosMembro {
  usuarioId: string;
  papel: string;
  telas?: string[] | null;
  lojas?: string[] | null;
}

/** Muda papel, telas e lojas de alguém. "responsavel" = transferir a responsabilidade (só o responsável). */
export async function alterarMembro(repo: RepositorioContas, ctx: ContextoSessao | null, d: DadosMembro): Promise<void> {
  exigirConta(ctx);
  const alvo = await repo.membro(ctx.conta.id, d.usuarioId);
  if (!alvo) throw new ErroEquipe('membro não encontrado');
  if (!podeGerenciarMembro({ papel: ctx.papel, usuarioId: ctx.usuario.id }, alvo)) throw new ErroEquipe('você não pode alterar esta pessoa');
  const papel = d.papel as Papel;
  if (!PAPEIS.includes(papel)) throw new ErroEquipe('papel inválido');
  const problema = validarMudancaDePapel(ctx.papel, alvo.papel, papel);
  if (problema) throw new ErroEquipe(problema);
  if (papel === 'responsavel') {
    await repo.transferirResponsavel(ctx.conta.id, ctx.usuario.id, alvo.usuarioId);
    return;
  }
  if (ctx.papel === 'socio' && papel !== 'colaborador') throw new ErroEquipe('sócio só gerencia colaboradores');
  await repo.salvarMembro({
    contaId: ctx.conta.id,
    usuarioId: alvo.usuarioId,
    papel,
    telas: papel === 'colaborador' ? telasValidas(d.telas) : null,
    lojas: papel === 'colaborador' ? await lojasValidas(repo, ctx.conta.id, d.lojas) : null,
  });
}

export async function removerMembro(repo: RepositorioContas, ctx: ContextoSessao | null, usuarioId: string): Promise<void> {
  exigirConta(ctx);
  if (usuarioId === ctx.usuario.id) {
    if (ctx.papel === 'responsavel') throw new ErroEquipe('o responsável não sai da conta: transfira a responsabilidade antes');
    await repo.removerMembro(ctx.conta.id, usuarioId);
    return;
  }
  const alvo = await repo.membro(ctx.conta.id, usuarioId);
  if (!alvo) throw new ErroEquipe('membro não encontrado');
  if (!podeGerenciarMembro({ papel: ctx.papel, usuarioId: ctx.usuario.id }, alvo)) throw new ErroEquipe('você não pode remover esta pessoa');
  await repo.removerMembro(ctx.conta.id, usuarioId);
}

function exigirGestor(ctx: ContextoSessao & { papel: Papel }) {
  if (ctx.papel === 'colaborador') throw new ErroEquipe('só o responsável e os sócios mexem nas lojas');
}

export async function salvarLoja(repo: RepositorioContas, ctx: ContextoSessao | null, d: { codigo: string; nome?: string | null; franquiaLimite?: number | string | null }): Promise<string> {
  exigirConta(ctx);
  exigirGestor(ctx);
  const codigo = normalizarCodigoLoterica(String(d.codigo ?? '').trim());
  if (!codigo) throw new ErroEquipe('código de lotérica inválido (ex.: 2894 ou 21.002894-7)');
  const franquia = Number(String(d.franquiaLimite ?? '8000').replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(franquia) || franquia <= 0 || franquia > 1_000_000) throw new ErroEquipe('franquia diária inválida');
  const atual = (await repo.lojas(ctx.conta.id)).find((l) => l.codigo === codigo);
  await repo.salvarLoja({ contaId: ctx.conta.id, codigo, nome: d.nome?.trim() || atual?.nome || `Lotérica ${codigo}`, franquiaLimite: Math.round(franquia * 100) / 100 });
  return codigo;
}

export async function removerLoja(repo: RepositorioContas, ctx: ContextoSessao | null, codigo: string): Promise<void> {
  exigirConta(ctx);
  exigirGestor(ctx);
  const lojas = await repo.lojas(ctx.conta.id);
  if (lojas.length <= 1) throw new ErroEquipe('a conta precisa de ao menos uma lotérica');
  await repo.removerLoja(ctx.conta.id, codigo);
}

export async function renomearConta(repo: RepositorioContas, ctx: ContextoSessao | null, nome: string): Promise<void> {
  exigirConta(ctx);
  if (ctx.papel !== 'responsavel') throw new ErroEquipe('só o responsável muda o nome da conta');
  if (nome.trim().length < 2) throw new ErroEquipe('nome curto demais');
  await repo.renomearConta(ctx.conta.id, nome.trim());
}

/** Cria mais uma conta (outra empresa) com a pessoa como responsável. */
export async function criarOutraConta(repo: RepositorioContas, ctx: ContextoSessao | null, d: { nome: string; codigo: string; nomeLoja?: string | null }): Promise<string> {
  if (!ctx) throw new ErroEquipe('entre primeiro');
  const codigo = normalizarCodigoLoterica(d.codigo.trim());
  if (!codigo) throw new ErroEquipe('código de lotérica inválido');
  if (d.nome.trim().length < 2) throw new ErroEquipe('informe o nome da conta');
  const conta = await repo.criarConta(d.nome.trim());
  await repo.salvarLoja({ contaId: conta.id, codigo, nome: d.nomeLoja?.trim() || `Lotérica ${codigo}`, franquiaLimite: 8000 });
  await repo.salvarMembro({ contaId: conta.id, usuarioId: ctx.usuario.id, papel: 'responsavel', telas: null, lojas: null });
  return conta.id;
}

/** Tudo que a tela Equipe mostra. */
export async function painelEquipe(repo: RepositorioContas, ctx: ContextoSessao | null, agora: Date) {
  exigirConta(ctx);
  const [conta, lojas, membros, convites] = await Promise.all([repo.conta(ctx.conta.id), repo.lojas(ctx.conta.id), repo.membros(ctx.conta.id), repo.convites(ctx.conta.id)]);
  return {
    conta: conta!,
    lojas,
    membros: membros.map((m) => ({
      ...m,
      euMesmo: m.usuarioId === ctx.usuario.id,
      gerenciavel: podeGerenciarMembro({ papel: ctx.papel, usuarioId: ctx.usuario.id }, m),
    })),
    convites: convites.map((c) => ({ ...c, estado: estadoDoConvite(c, agora) })).filter((c) => c.estado === 'pendente' || agora.getTime() - c.criadoEm.getTime() < 30 * 86_400_000),
    papel: ctx.papel,
  };
}
