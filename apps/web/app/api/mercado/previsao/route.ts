import { erro, json } from '@/lib/api';
import { fonteDeDados } from '@/lib/fonte-dados';
import { lerInstante, previsaoDoConcurso } from '@/lib/mercado';

export const dynamic = 'force-dynamic';

/** GET /api/mercado/previsao?concurso=lotofacil-3790&em=: previsão de fechamento + backtest. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const chave = s.get('concurso');
  if (!chave) return erro('informe o concurso (ex.: lotofacil-3790)', 400);
  const d = await previsaoDoConcurso(fonteDeDados(), chave, { em: lerInstante(s.get('em')) });
  return d ? json(d) : erro('concurso não encontrado', 404);
}
