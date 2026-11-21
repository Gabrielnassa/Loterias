import { erro } from '@/lib/api';
import { fonteDeDados } from '@/lib/fonte-dados';
import { marcarEstorno, MinhaIndisponivel } from '@/lib/minha';

export const dynamic = 'force-dynamic';

/** POST /api/minha/boloes/{id}/estorno  {"estornado": true|false} — marcação manual do usuário. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const corpo = (await req.json().catch(() => null)) as { estornado?: unknown } | null;
  if (!Number.isInteger(id) || typeof corpo?.estornado !== 'boolean') return erro('informe {"estornado": true|false}', 400);
  try {
    const mudou = await marcarEstorno(fonteDeDados(), id, corpo.estornado);
    return Response.json({ id, estornado: corpo.estornado, mudou });
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return erro(e.message, 409);
    throw e;
  }
}
