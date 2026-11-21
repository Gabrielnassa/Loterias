import { responder } from '@/lib/api-minha';
import { COLUNAS_FINANCEIRO } from '@/lib/exportar-minha';
import { fonteDeDados } from '@/lib/fonte-dados';
import { financeiroMkp } from '@/lib/minha';

export const dynamic = 'force-dynamic';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/minha/financeiro?de=AAAA-MM-DD&ate=AAAA-MM-DD&formato=json|csv|xlsx */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const de = s.get('de') ?? undefined;
  const ate = s.get('ate') ?? undefined;
  return responder(
    req,
    async () => {
      const r = await financeiroMkp(fonteDeDados(), { ...(de && DIA.test(de) ? { de } : {}), ...(ate && DIA.test(ate) ? { ate } : {}), loja: s.get('loja') });
      return { ...r, linhas: r.boloes };
    },
    { nome: 'financeiro-mkp', aba: 'Financeiro', colunas: COLUNAS_FINANCEIRO },
  );
}
