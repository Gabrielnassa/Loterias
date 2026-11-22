import { repositorioContas } from '@/lib/contas/ativo';
import { criarOutraConta, ErroEquipe } from '@/lib/contas/equipe';
import { lerCorpo, responder } from '@/lib/contas/http';
import { contexto } from '@/lib/contexto';

export const dynamic = 'force-dynamic';

/** GET /api/conta: quem está logado (contexto da sessão). */
export async function GET() {
  return Response.json({ contexto: await contexto() });
}

/** POST /api/conta com `acao` = perfil | criar-conta. (Senha e troca de conta: /api/auth.) */
export async function POST(req: Request) {
  const repo = repositorioContas();
  if (!repo) return responder(req, '/conta', { erro: 'contas desligadas' });
  const c = await lerCorpo(req);
  const ctx = await contexto();
  if (!ctx) return responder(req, '/entrar', { erro: 'entre primeiro' });
  try {
    switch (c.um('acao')) {
      case 'perfil': {
        const nome = c.um('nome').trim();
        if (nome.length < 2) return responder(req, '/conta', { erro: 'nome curto demais' });
        await repo.atualizarUsuario(ctx.usuario.id, { nome });
        return responder(req, '/conta', { ok: 'perfil salvo' });
      }
      case 'criar-conta': {
        await criarOutraConta(repo, ctx, { nome: c.um('nome'), codigo: c.um('codigo'), nomeLoja: c.um('nome_loja') });
        return responder(req, '/conta', { ok: 'conta criada: troque para ela na lista abaixo' });
      }
      default:
        return responder(req, '/conta', { erro: 'ação desconhecida' });
    }
  } catch (e) {
    if (e instanceof ErroEquipe) return responder(req, '/conta', { erro: e.message });
    throw e;
  }
}
