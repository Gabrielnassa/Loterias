import { erro, json } from '@/lib/api';
import { analisarLoteca } from '@/lib/loteca';

export const dynamic = 'force-dynamic';

/** POST /api/loteca {grade: "A x B; 1,8; 3,4; 4,5\n...", duplos?, triplos?}: chances e melhores marcações. */
export async function POST(req: Request) {
  let corpo: { grade?: unknown; duplos?: unknown; triplos?: unknown };
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return erro('corpo JSON inválido', 400);
  }
  if (typeof corpo.grade !== 'string') return erro('informe a grade (14 linhas)', 400);
  const a = analisarLoteca(corpo.grade, typeof corpo.duplos === 'number' ? corpo.duplos : undefined, typeof corpo.triplos === 'number' ? corpo.triplos : undefined);
  if (a.jogos.length !== 14) return erro(`a grade precisa de 14 jogos (${a.jogos.length} lidos)`, 400);
  return json(a);
}
