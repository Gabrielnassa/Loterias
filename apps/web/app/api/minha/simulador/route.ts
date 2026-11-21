import { erro, json } from '@/lib/api';
import { simuladorDePosicao } from '@/lib/abertura-ferramentas';
import { fonteDeDados } from '@/lib/fonte-dados';
import { MinhaIndisponivel } from '@/lib/minha';

export const dynamic = 'force-dynamic';

/** GET /api/minha/simulador?hora=21:45:30&dia=5&modalidade=todas&loja=: em que página cai o 1º bolão. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  try {
    return json(await simuladorDePosicao(fonteDeDados(), { loja: s.get('loja'), hora: s.get('hora'), diaSemana: s.get('dia') ? Number(s.get('dia')) : null, modalidade: s.get('modalidade') }));
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return erro(e.message, 409);
    throw e;
  }
}
