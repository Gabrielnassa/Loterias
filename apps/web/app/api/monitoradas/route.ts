import { repositorioAvisos } from '@/lib/avisos/ativo';
import { deixarDeMonitorar, ErroAvisos, monitorar, painelMonitoradas } from '@/lib/avisos/painel';
import { lerCorpo, responder } from '@/lib/contas/http';
import { contexto } from '@/lib/contexto';
import { fonteDeDados } from '@/lib/fonte-dados';

export const dynamic = 'force-dynamic';

/** GET /api/monitoradas: as monitoradas da conta com a semana e a última entrada na abertura. */
export async function GET() {
  const repo = repositorioAvisos();
  if (!repo) return Response.json({ erro: 'contas desligadas' }, { status: 409 });
  try {
    return Response.json(await painelMonitoradas(repo, fonteDeDados(), await contexto()));
  } catch (e) {
    if (e instanceof ErroAvisos) return Response.json({ erro: e.message }, { status: 400 });
    throw e;
  }
}

/** POST /api/monitoradas com `acao` = adicionar (codigo, apelido) | remover (codigo). */
export async function POST(req: Request) {
  const repo = repositorioAvisos();
  if (!repo) return responder(req, '/monitoradas', { erro: 'contas desligadas: defina DATABASE_URL (ou RADAR_AUTH=memoria)' });
  const c = await lerCorpo(req);
  const ctx = await contexto();
  try {
    if (c.um('acao') === 'remover') {
      await deixarDeMonitorar(repo, ctx, c.um('codigo'));
      return responder(req, '/monitoradas', { ok: 'deixou de monitorar' });
    }
    const l = await monitorar(repo, fonteDeDados(), ctx, { codigo: c.um('codigo'), apelido: c.um('apelido') });
    return responder(req, '/monitoradas', { ok: `monitorando ${l.nome}` });
  } catch (e) {
    if (e instanceof ErroAvisos) return responder(req, '/monitoradas', { erro: e.message });
    throw e;
  }
}
