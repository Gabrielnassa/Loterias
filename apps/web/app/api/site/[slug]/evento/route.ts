import { fonteDeDados } from '@/lib/fonte-dados';
import { registrarEvento, siteDoSlug } from '@/lib/site';

export const dynamic = 'force-dynamic';

const TIPOS = new Set(['visita', 'whatsapp', 'caixa', 'carrinho']);

/** POST /api/site/{slug}/evento {tipo, visitante, bolaoId?}: métrica de acesso (sem dado pessoal). */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const fonte = fonteDeDados();
  const site = await siteDoSlug(fonte, slug);
  if (!site) return new Response(null, { status: 404 });
  let corpo: { tipo?: unknown; visitante?: unknown; bolaoId?: unknown };
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof corpo.tipo !== 'string' || !TIPOS.has(corpo.tipo) || typeof corpo.visitante !== 'string' || !/^[\w-]{1,64}$/.test(corpo.visitante)) {
    return new Response(null, { status: 400 });
  }
  await registrarEvento(fonte, site, {
    tipo: corpo.tipo as 'visita' | 'whatsapp' | 'caixa' | 'carrinho',
    visitante: corpo.visitante,
    bolaoId: typeof corpo.bolaoId === 'string' ? corpo.bolaoId.slice(0, 40) : null,
  });
  return new Response(null, { status: 204 });
}
