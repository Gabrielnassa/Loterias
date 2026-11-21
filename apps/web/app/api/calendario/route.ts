import { json } from '@/lib/api';
import { calendarioDoMes } from '@radar/core';

export const dynamic = 'force-dynamic';

/** GET /api/calendario?mes=2026-11: sorteios do mês (referência). */
export async function GET(req: Request) {
  const m = /^(\d{4})-(\d{2})$/.exec(new URL(req.url).searchParams.get('mes') ?? '');
  const agora = new Date();
  const ano = m ? Number(m[1]) : agora.getUTCFullYear();
  const mes = m ? Number(m[2]) : agora.getUTCMonth() + 1;
  return json({ ano, mes, dias: calendarioDoMes(ano, mes) });
}
