import { lerPreferencias } from '@radar/core';
import { repositorioAvisos } from '@/lib/avisos/ativo';
import { lerCorpo, responder } from '@/lib/contas/http';
import { contexto } from '@/lib/contexto';

export const dynamic = 'force-dynamic';

/** GET /api/notificacoes: as notificações da pessoa (central) e quantas faltam ler. */
export async function GET() {
  const repo = repositorioAvisos();
  const ctx = await contexto();
  if (!repo || !ctx) return Response.json({ notificacoes: [], naoLidas: 0 });
  const [notificacoes, naoLidas] = await Promise.all([repo.notificacoes(ctx.usuario.id, 50), repo.naoLidas(ctx.usuario.id)]);
  return Response.json({ notificacoes, naoLidas });
}

/**
 * POST /api/notificacoes com `acao` = ler-todas | ler (id) | preferencias (aparelho + campos) |
 * remover-aparelho (aparelho). Preferências são POR APARELHO.
 */
export async function POST(req: Request) {
  const repo = repositorioAvisos();
  const ctx = await contexto();
  if (!repo || !ctx) return responder(req, '/notificacoes', { erro: 'entre primeiro' });
  const c = await lerCorpo(req);
  switch (c.um('acao')) {
    case 'ler-todas':
      await repo.marcarLidas(ctx.usuario.id);
      return responder(req, '/notificacoes', { ok: 'tudo lido' });
    case 'ler':
      await repo.marcarLidas(ctx.usuario.id, [c.um('id')]);
      return responder(req, '/notificacoes', { ok: 'lida' });
    case 'preferencias': {
      const sim = (k: string) => c.um(k) === '1' || c.um(k) === 'on';
      const ok = await repo.preferenciasDoAparelho(
        c.um('aparelho'),
        ctx.usuario.id,
        lerPreferencias({ vendas: c.um('vendas'), resultados: sim('resultados'), previsaoZerar: sim('previsaoZerar'), premios: sim('premios'), monitoradas: sim('monitoradas'), resumoSemanal: sim('resumoSemanal') }),
      );
      return responder(req, '/notificacoes', ok ? { ok: 'preferências deste aparelho salvas' } : { erro: 'aparelho não encontrado' });
    }
    case 'remover-aparelho':
      await repo.removerAparelho(c.um('aparelho'), ctx.usuario.id);
      return responder(req, '/notificacoes', { ok: 'aparelho removido (não recebe mais push)' });
    default:
      return responder(req, '/notificacoes', { erro: 'ação desconhecida' });
  }
}
