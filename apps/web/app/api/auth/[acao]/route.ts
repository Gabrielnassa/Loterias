import { voltaSegura } from '@radar/core';
import { aceitarConvite, cadastrar, definirSenha, entrarComSenha, ErroAcesso, pedirLink, sair, trocarConta, usarLink } from '@/lib/contas/acesso';
import { repositorioContas } from '@/lib/contas/ativo';
import { apagarCookieSessao, aparelhoDe, cookieSessao, lerCorpo, responder, tokenDoCookie, urlBase } from '@/lib/contas/http';
import { contextoDoToken } from '@/lib/contas/sessao';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ acao: string }> };

const DESLIGADO = 'contas desligadas: defina DATABASE_URL (ou RADAR_AUTH=memoria para testar)';

/** GET /api/auth/link?token=...: abre o link mágico do e-mail, cria a sessão e entra. */
export async function GET(req: Request, { params }: Ctx) {
  const { acao } = await params;
  const repo = repositorioContas();
  if (acao !== 'link') return new Response('não encontrado', { status: 404 });
  if (!repo) return responder(req, '/entrar', { erro: DESLIGADO });
  try {
    const r = await usarLink(repo, new URL(req.url).searchParams.get('token') ?? '', new Date(), aparelhoDe(req));
    return new Response(null, { status: 303, headers: { location: r.voltar, 'set-cookie': cookieSessao(req, r.token) } });
  } catch (e) {
    return responder(req, '/entrar', { erro: (e as Error).message });
  }
}

/**
 * POST /api/auth/{entrar|link|cadastro|convite|senha|trocar-conta|sair}
 * Formulário ou JSON; responde JSON (Accept: application/json) ou redireciona com ?ok=/?erro=.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { acao } = await params;
  const repo = repositorioContas();
  const c = await lerCorpo(req);
  const voltar = voltaSegura(c.um('voltar'));
  const agora = new Date();
  if (!repo) return responder(req, '/entrar', { erro: DESLIGADO });
  try {
    switch (acao) {
      case 'entrar': {
        const token = await entrarComSenha(repo, { email: c.um('email'), senha: c.um('senha') }, agora, aparelhoDe(req));
        return responder(req, voltar, { ok: 'bem-vindo', redirecionar: voltar }, { 'set-cookie': cookieSessao(req, token) });
      }
      case 'link': {
        const r = await pedirLink(repo, { email: c.um('email'), voltar }, urlBase(req), agora);
        return responder(req, `/entrar?enviado=1${r.linkDev ? `&dev=${encodeURIComponent(r.linkDev)}` : ''}`, { ok: 'se o e-mail tiver conta, mandamos um link de acesso', ...(r.linkDev ? { link: r.linkDev } : {}) });
      }
      case 'cadastro': {
        const r = await cadastrar(repo, { nome: c.um('nome'), email: c.um('email'), senha: c.um('senha') || null, empresa: c.um('empresa'), lojas: c.um('lojas') }, urlBase(req), agora);
        return responder(req, `/entrar?enviado=1${r.linkDev ? `&dev=${encodeURIComponent(r.linkDev)}` : ''}`, { ok: 'mandamos um link para confirmar o e-mail', ...(r.linkDev ? { link: r.linkDev } : {}) });
      }
      case 'convite': {
        const tokenSessao = tokenDoCookie(req);
        const ctx = tokenSessao ? await contextoDoToken(repo, tokenSessao, agora) : null;
        const r = await aceitarConvite(repo, { token: c.um('token'), logado: ctx ? { id: ctx.usuario.id, email: ctx.usuario.email } : null, nome: c.um('nome'), senha: c.um('senha') || null }, agora, aparelhoDe(req));
        if (tokenSessao && ctx) await trocarConta(repo, tokenSessao, ctx.usuario.id, r.contaId);
        return responder(req, '/', { ok: 'convite aceito', redirecionar: '/' }, r.sessao ? { 'set-cookie': cookieSessao(req, r.sessao) } : {});
      }
      case 'senha': {
        const token = tokenDoCookie(req);
        const ctx = token ? await contextoDoToken(repo, token, agora) : null;
        if (!ctx) return responder(req, '/entrar', { erro: 'entre primeiro' });
        await definirSenha(repo, ctx.usuario, { atual: c.um('atual') || null, nova: c.um('nova') }, token);
        return responder(req, '/conta', { ok: 'senha salva; as outras sessões foram encerradas' });
      }
      case 'trocar-conta': {
        const token = tokenDoCookie(req);
        const ctx = token ? await contextoDoToken(repo, token, agora) : null;
        if (!ctx || !token) return responder(req, '/entrar', { erro: 'entre primeiro' });
        await trocarConta(repo, token, ctx.usuario.id, c.um('conta'));
        return responder(req, '/', { ok: 'conta trocada', redirecionar: '/' });
      }
      case 'sair': {
        await sair(repo, tokenDoCookie(req));
        return responder(req, '/entrar', { ok: 'até logo', redirecionar: '/entrar' }, { 'set-cookie': apagarCookieSessao(req) });
      }
      default:
        return new Response('não encontrado', { status: 404 });
    }
  } catch (e) {
    if (e instanceof ErroAcesso) return responder(req, acao === 'cadastro' ? '/cadastro' : acao === 'convite' ? `/convite/${c.um('token')}` : acao === 'senha' ? '/conta' : '/entrar', { erro: e.message });
    throw e;
  }
}
