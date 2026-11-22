import type { ContextoSessao } from './sessao';
import { hashToken, novoToken } from './token';
import type { ChaveApi, RepositorioContas } from './tipos';

/**
 * Chaves da API pública (/api/publica/v1), uma por integração (ex.: o site WordPress da lotérica).
 * Formato rl_<aleatório>; o banco guarda só o SHA-256 e os 8 primeiros caracteres (para reconhecer).
 * Sem contas (instalação sem banco), vale a chave única RADAR_API_CHAVE do ambiente.
 */
export class ErroChave extends Error {}

export async function criarChave(repo: RepositorioContas, ctx: ContextoSessao | null, nome: string): Promise<{ chave: string; registro: ChaveApi }> {
  if (!ctx?.conta || !ctx.papel) throw new ErroChave('entre numa conta primeiro');
  if (ctx.papel === 'colaborador') throw new ErroChave('só o responsável e os sócios criam chaves da API');
  const ativas = (await repo.chavesApi(ctx.conta.id)).filter((c) => !c.revogadaEm);
  if (ativas.length >= 10) throw new ErroChave('máximo de 10 chaves ativas por conta: revogue uma antes');
  const chave = `rl_${novoToken(24)}`;
  const registro = await repo.criarChaveApi({ contaId: ctx.conta.id, nome: nome.trim().slice(0, 60) || 'Integração', prefixo: chave.slice(0, 11), hash: await hashToken(chave), criadoPor: ctx.usuario.id });
  return { chave, registro };
}

export async function revogarChave(repo: RepositorioContas, ctx: ContextoSessao | null, id: string): Promise<void> {
  if (!ctx?.conta || !ctx.papel || ctx.papel === 'colaborador') throw new ErroChave('só o responsável e os sócios revogam chaves');
  await repo.revogarChaveApi(ctx.conta.id, id, new Date());
}

/** Lê a chave do cabeçalho (Authorization: Bearer ... ou X-Radar-Chave). */
export function chaveDaRequisicao(req: Request): string | null {
  const a = req.headers.get('authorization');
  if (a?.toLowerCase().startsWith('bearer ')) return a.slice(7).trim();
  return req.headers.get('x-radar-chave')?.trim() || null;
}

// limite simples por chave: 120 chamadas por minuto (o plugin usa cache, então sobra muito)
const usos = new Map<string, number[]>();
function dentroDoLimite(id: string, agora: number): boolean {
  const lista = (usos.get(id) ?? []).filter((t) => t > agora - 60_000);
  lista.push(agora);
  usos.set(id, lista);
  return lista.length <= 120;
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export type AcessoApi = { tipo: 'conta'; contaId: string; chaveId: string } | { tipo: 'instalacao' };

/** Valida a chave: devolve a conta dona (ou a instalação sem contas) ou lança ErroChave com o status. */
export async function autenticarChave(repo: RepositorioContas | null, valor: string | null, agora = new Date()): Promise<AcessoApi> {
  if (!valor) throw Object.assign(new ErroChave('informe a chave da API (cabeçalho Authorization: Bearer ...)'), { status: 401 });
  if (!repo) {
    const unica = process.env.RADAR_API_CHAVE;
    if (!unica || !iguais(valor, unica)) throw Object.assign(new ErroChave('chave inválida'), { status: 401 });
    if (!dentroDoLimite('instalacao', agora.getTime())) throw Object.assign(new ErroChave('muitas chamadas: espere um minuto'), { status: 429 });
    return { tipo: 'instalacao' };
  }
  const c = await repo.chaveApiPorHash(await hashToken(valor));
  if (!c || c.revogadaEm) throw Object.assign(new ErroChave('chave inválida ou revogada'), { status: 401 });
  if (!dentroDoLimite(c.id, agora.getTime())) throw Object.assign(new ErroChave('muitas chamadas: espere um minuto'), { status: 429 });
  if (!c.ultimoUsoEm || agora.getTime() - c.ultimoUsoEm.getTime() > 5 * 60_000) await repo.usarChaveApi(c.id, agora);
  return { tipo: 'conta', contaId: c.contaId, chaveId: c.id };
}
