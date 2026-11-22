import { repositorioContas } from '@/lib/contas/ativo';
import { alterarMembro, cancelarConvite, convidar, ErroEquipe, painelEquipe, removerLoja, removerMembro, renomearConta, salvarLoja } from '@/lib/contas/equipe';
import { lerCorpo, responder, urlBase } from '@/lib/contas/http';
import { contexto } from '@/lib/contexto';

export const dynamic = 'force-dynamic';

/** GET /api/equipe: lojas, membros e convites da conta ativa (JSON). */
export async function GET() {
  const repo = repositorioContas();
  if (!repo) return Response.json({ erro: 'contas desligadas' }, { status: 409 });
  try {
    const p = await painelEquipe(repo, await contexto(), new Date());
    return Response.json({ ...p, convites: p.convites.map(({ tokenHash: _t, ...c }) => c), membros: p.membros.map((m) => ({ ...m, usuario: { id: m.usuario.id, nome: m.usuario.nome, email: m.usuario.email } })) });
  } catch (e) {
    if (e instanceof ErroEquipe) return Response.json({ erro: e.message }, { status: 403 });
    throw e;
  }
}

/**
 * POST /api/equipe com `acao` = convidar | cancelar-convite | alterar-membro | remover-membro |
 * salvar-loja | remover-loja | renomear. As regras de quem pode o quê estão em core/contas/permissoes.ts.
 */
export async function POST(req: Request) {
  const repo = repositorioContas();
  if (!repo) return responder(req, '/equipe', { erro: 'contas desligadas: defina DATABASE_URL (ou RADAR_AUTH=memoria)' });
  const c = await lerCorpo(req);
  const ctx = await contexto();
  const agora = new Date();
  const lista = (k: string) => (c.um(`${k}_todas`) === '1' ? null : c.varios(k));
  try {
    switch (c.um('acao')) {
      case 'convidar': {
        const r = await convidar(repo, ctx, { email: c.um('email'), papel: c.um('papel'), telas: lista('telas'), lojas: lista('lojas') }, urlBase(req), agora);
        return responder(req, '/equipe', { ok: `convite enviado para ${r.convite.email}`, link: r.link });
      }
      case 'cancelar-convite':
        await cancelarConvite(repo, ctx, c.um('id'), agora);
        return responder(req, '/equipe', { ok: 'convite cancelado' });
      case 'alterar-membro':
        await alterarMembro(repo, ctx, { usuarioId: c.um('usuario'), papel: c.um('papel'), telas: lista('telas'), lojas: lista('lojas') });
        return responder(req, '/equipe', { ok: 'permissões salvas' });
      case 'remover-membro': {
        const saindo = c.um('usuario') === ctx?.usuario.id;
        await removerMembro(repo, ctx, c.um('usuario'));
        return responder(req, saindo ? '/conta' : '/equipe', { ok: saindo ? 'você saiu da conta' : 'pessoa removida', ...(saindo ? { redirecionar: '/conta' } : {}) });
      }
      case 'salvar-loja': {
        const codigo = await salvarLoja(repo, ctx, { codigo: c.um('codigo'), nome: c.um('nome'), franquiaLimite: c.um('franquia') || '8000' });
        return responder(req, '/equipe', { ok: `lotérica ${codigo} salva` });
      }
      case 'remover-loja':
        await removerLoja(repo, ctx, c.um('codigo'));
        return responder(req, '/equipe', { ok: 'lotérica removida da conta' });
      case 'renomear':
        await renomearConta(repo, ctx, c.um('nome'));
        return responder(req, '/equipe', { ok: 'nome da conta salvo' });
      default:
        return responder(req, '/equipe', { erro: 'ação desconhecida' });
    }
  } catch (e) {
    if (e instanceof ErroEquipe) return responder(req, '/equipe', { erro: e.message });
    throw e;
  }
}
