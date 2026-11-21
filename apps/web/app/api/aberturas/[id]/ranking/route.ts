import { erro, json } from '@/lib/api';
import { fonteDeDados } from '@/lib/fonte-dados';
import { lerEscopo, rankingDaAbertura } from '@/lib/servico';

export const dynamic = 'force-dynamic';

/** GET /api/aberturas/{id}/ranking?escopo=uf&uf=SP — ordem de chegada da abertura (SPEC). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = new URL(req.url).searchParams;
  const r = await rankingDaAbertura(fonteDeDados(), id, {
    escopo: lerEscopo(s.get('escopo')),
    ...(s.get('uf') ? { uf: s.get('uf')! } : {}),
    ...(s.get('cidade') ? { cidade: s.get('cidade')! } : {}),
  });
  return r ? json(r) : erro(`abertura ${id} não encontrada`, 404);
}
