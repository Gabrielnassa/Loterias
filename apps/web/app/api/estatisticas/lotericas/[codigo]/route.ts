import { normalizarCodigoLoterica } from '@radar/core';
import { erro, json } from '@/lib/api';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fichaDaLoterica } from '@/lib/mercado';

export const dynamic = 'force-dynamic';

/** GET /api/estatisticas/lotericas/{codigo}?dias=30: ficha completa da lotérica (aceita 2894, 002894 ou 21.002894-7). */
export async function GET(req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  const dias = [7, 30, 90].includes(Number(new URL(req.url).searchParams.get('dias'))) ? Number(new URL(req.url).searchParams.get('dias')) : 30;
  const f = await fichaDaLoterica(fonteDeDados(), normalizarCodigoLoterica(decodeURIComponent(codigo)) ?? codigo, { dias });
  return f ? json(f) : erro('lotérica não encontrada no período', 404);
}
