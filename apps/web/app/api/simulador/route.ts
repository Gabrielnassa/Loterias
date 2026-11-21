import { erro, json } from '@/lib/api';
import { ehModalidade, simularBolao } from '@radar/core';

export const dynamic = 'force-dynamic';

/** GET /api/simulador?modalidade=dupla-sena&numeros=9&jogos=1&cotas=50&franquia=8000&venda=0.8 */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const m = s.get('modalidade');
  if (!m || !ehModalidade(m)) return erro('informe a modalidade', 400);
  const n = (k: string) => (s.get(k) === null ? undefined : Number(s.get(k)));
  return json(
    simularBolao({
      modalidade: m,
      ...(n('numeros') !== undefined ? { numeros: n('numeros')! } : {}),
      ...(n('trevos') !== undefined ? { trevos: n('trevos')! } : {}),
      ...(n('duplos') !== undefined ? { duplos: n('duplos')! } : {}),
      ...(n('triplos') !== undefined ? { triplos: n('triplos')! } : {}),
      jogos: n('jogos') ?? 1,
      cotas: n('cotas') ?? 10,
      franquia: n('franquia') ?? null,
      ...(n('venda') !== undefined ? { vendaEsperada: n('venda')! } : {}),
    }),
  );
}
