import { json } from '@/lib/api';
import { fonteDeDados } from '@/lib/fonte-dados';

export const dynamic = 'force-dynamic';

/** GET /api/lotericas?q=termo&limite=20 — busca por nome, cidade ou código. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = u.searchParams.get('q') ?? '';
  const limite = Math.min(50, Math.max(1, Number(u.searchParams.get('limite')) || 20));
  const lotericas = await fonteDeDados().buscar(q, limite);
  return Response.json({ q, lotericas }, { headers: { 'cache-control': 'no-store' } });
}
