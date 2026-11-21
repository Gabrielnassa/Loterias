import { erro, json } from '@/lib/api';
import { fonteDeDados } from '@/lib/dados';
import { compararGrade, lerEscopo, lerModalidade, lerSemanas } from '@/lib/servico';

export const dynamic = 'force-dynamic';

/** GET /api/comparar?codigos=a,b,c&semanas=4&escopo=uf — você + até 5 concorrentes. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const codigos = (s.get('codigos') ?? '').split(',').map((c) => c.trim()).filter(Boolean);
  if (!codigos.length) return erro('informe ?codigos=', 400);
  if (codigos.length > 6) return erro('no máximo 6 lotéricas (você + 5)', 400);
  return json(
    await compararGrade(fonteDeDados(), codigos, {
      semanas: lerSemanas(s.get('semanas'), 4, 12),
      modalidade: lerModalidade(s.get('modalidade')),
      escopo: lerEscopo(s.get('escopo')),
    }),
  );
}
