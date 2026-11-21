import { erro, json } from '@/lib/api';
import { fonteDeDados } from '@/lib/fonte-dados';
import { MinhaIndisponivel, posicaoMinha } from '@/lib/minha';

export const dynamic = 'force-dynamic';

/** GET /api/minha/posicao?dias=7|30|90 — posição na abertura. */
export async function GET(req: Request) {
  try {
    return json(await posicaoMinha(fonteDeDados(), { dias: Number(new URL(req.url).searchParams.get('dias')) || 30 }));
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return erro(e.message, 409);
    throw e;
  }
}
