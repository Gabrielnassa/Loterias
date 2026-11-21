import { json } from '@/lib/api';
import { fonteDeDados } from '@/lib/dados';

export const dynamic = 'force-dynamic';

/** GET /api/aberturas?limite=50 — aberturas mais recentes. */
export async function GET(req: Request) {
  const limite = Math.min(500, Math.max(1, Number(new URL(req.url).searchParams.get('limite')) || 50));
  const a = (await fonteDeDados().aberturas()).sort((x, y) => y.t0.getTime() - x.t0.getTime()).slice(0, limite);
  return json(a);
}
