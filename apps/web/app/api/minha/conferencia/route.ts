import { responder } from '@/lib/api-minha';
import { COLUNAS_CONFERENCIA } from '@/lib/exportar-minha';
import { fonteDeDados } from '@/lib/fonte-dados';
import { conferenciaMkp } from '@/lib/minha';

export const dynamic = 'force-dynamic';

/** GET /api/minha/conferencia?dias=30&formato=json|csv|xlsx — prêmios conferidos com o resultado oficial. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const dias = Math.min(180, Math.max(1, Number(s.get('dias')) || 30));
  return responder(req, () => conferenciaMkp(fonteDeDados(), { dias, loja: s.get('loja') }), { nome: 'conferencia-mkp', aba: 'Conferência', colunas: COLUNAS_CONFERENCIA });
}
