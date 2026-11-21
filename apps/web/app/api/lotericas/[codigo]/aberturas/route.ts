import { erro, json } from '@/lib/api';
import { fonteDeDados } from '@/lib/dados';
import { fichaAberturas, lerEscopo, lerModalidade, lerSemanas } from '@/lib/servico';

export const dynamic = 'force-dynamic';

/** GET /api/lotericas/{codigo}/aberturas?semanas=12&modalidade=todas&escopo=uf (SPEC, API do Raio-X). */
export async function GET(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const s = new URL(req.url).searchParams;
  const f = await fichaAberturas(fonteDeDados(), codigo, {
    semanas: lerSemanas(s.get('semanas')),
    modalidade: lerModalidade(s.get('modalidade')),
    escopo: lerEscopo(s.get('escopo')),
  });
  return f ? json(f) : erro(`lotérica ${codigo} não encontrada`, 404);
}
