import { PREFERENCIAS_PADRAO } from '@radar/core';
import { criarEnviarPush } from '@radar/avisos/push';
import { chavePublicaVapid, repositorioAvisos } from '@/lib/avisos/ativo';
import { contexto } from '@/lib/contexto';

export const dynamic = 'force-dynamic';

/** GET /api/push: chave pública VAPID (null = Web Push desligado no servidor). */
export async function GET() {
  return Response.json({ chavePublica: chavePublicaVapid() });
}

type Inscricao = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/**
 * POST /api/push (JSON) com `acao`:
 * - inscrever: { inscricao: PushSubscription.toJSON(), nome } -> cria/atualiza o aparelho desta pessoa;
 * - testar: { endpoint } -> manda um push de teste para este aparelho.
 */
export async function POST(req: Request) {
  const repo = repositorioAvisos();
  const ctx = await contexto();
  if (!repo || !ctx) return Response.json({ erro: 'entre primeiro' }, { status: 401 });
  const d = (await req.json().catch(() => ({}))) as { acao?: string; inscricao?: Inscricao; nome?: string; endpoint?: string };
  if (d.acao === 'inscrever') {
    const i = d.inscricao;
    if (!i?.endpoint || !i.keys?.p256dh || !i.keys.auth || !/^https:\/\//.test(i.endpoint)) return Response.json({ erro: 'inscrição inválida' }, { status: 400 });
    const existente = await repo.aparelhoPorEndpoint(i.endpoint);
    const a = await repo.salvarAparelho({
      usuarioId: ctx.usuario.id,
      endpoint: i.endpoint,
      p256dh: i.keys.p256dh,
      auth: i.keys.auth,
      nome: (d.nome ?? '').slice(0, 80) || null,
      ...(existente ? {} : { preferencias: { ...PREFERENCIAS_PADRAO } }),
    });
    return Response.json({ ok: 'notificações ligadas neste aparelho', aparelho: { id: a.id } });
  }
  if (d.acao === 'testar') {
    const enviar = criarEnviarPush();
    if (!enviar) return Response.json({ erro: 'Web Push desligado no servidor (defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY)' }, { status: 409 });
    const ap = d.endpoint ? await repo.aparelhoPorEndpoint(d.endpoint) : null;
    if (!ap || ap.usuarioId !== ctx.usuario.id) return Response.json({ erro: 'aparelho não encontrado: ligue as notificações primeiro' }, { status: 404 });
    const r = await enviar(ap, { titulo: 'Radar Lotérico', corpo: 'Teste: as notificações deste aparelho estão funcionando.', url: '/notificacoes', chave: `teste:${Date.now()}`, categoria: 'sistema' });
    await repo.registrarEnvio(ap.id, r, new Date());
    return r === 'ok' ? Response.json({ ok: 'push de teste enviado' }) : Response.json({ erro: r === 'expirado' ? 'a inscrição expirou: ligue de novo' : 'o serviço de push recusou' }, { status: 502 });
  }
  return Response.json({ erro: 'ação desconhecida' }, { status: 400 });
}
