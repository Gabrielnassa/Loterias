import { responder } from '@/lib/api-minha';
import { COLUNAS_BOLOES } from '@/lib/exportar-minha';
import { fonteDeDados } from '@/lib/fonte-dados';
import { boloesMkp } from '@/lib/minha';

export const dynamic = 'force-dynamic';

/** GET /api/minha/boloes?dias=7&formato=json|csv|xlsx — Bolões MKP (ativos + últimos dias). */
export async function GET(req: Request) {
  const dias = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('dias')) || 7));
  return responder(req, () => boloesMkp(fonteDeDados(), { dias }), { nome: 'boloes-mkp', aba: 'Bolões', colunas: COLUNAS_BOLOES });
}
