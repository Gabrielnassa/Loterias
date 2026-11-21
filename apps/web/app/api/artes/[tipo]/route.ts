import { erro } from '@/lib/api';
import { renderizarPng, TIPOS_ARTE, type TipoArte } from '@/lib/artes';
import { dadosDaArte } from '@/lib/artes-dados';
import { fonteDeDados } from '@/lib/fonte-dados';
import { MinhaIndisponivel } from '@/lib/minha';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/artes/{resultado|boloes|premiado|saiu-aqui}?loja=&modalidade=&tamanho=1080&baixar=1: PNG com a marca da lotérica. */
export async function GET(req: Request, ctx: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await ctx.params;
  if (!(TIPOS_ARTE as string[]).includes(tipo)) return erro(`tipo de arte desconhecido: ${tipo}`, 404);
  const s = new URL(req.url).searchParams;
  try {
    const { no, demonstracao } = await dadosDaArte(fonteDeDados(), tipo as TipoArte, { loja: s.get('loja'), modalidade: s.get('modalidade') });
    const tamanho = Math.min(2160, Math.max(270, Number(s.get('tamanho')) || 1080));
    const png = await renderizarPng(no, tamanho);
    return new Response(new Uint8Array(png), {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'no-store',
        'x-dados': demonstracao ? 'demonstracao' : 'reais',
        ...(s.get('baixar') ? { 'content-disposition': `attachment; filename="arte-${tipo}.png"` } : {}),
      },
    });
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return erro(e.message, 409);
    throw e;
  }
}
