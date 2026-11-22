import { montarContexto, type ContextoSessao } from '@/lib/contas/sessao';
import { repositorioDemo } from './contas';

/** Substitui apps/web/lib/contexto.ts: na demonstração você está sempre logado como o responsável de exemplo. */
export async function contexto(): Promise<ContextoSessao | null> {
  // no build (Node) não há sessão: as telas geradas estaticamente ficam como antes
  if (typeof window === 'undefined') return null;
  const { repo, sessao } = await repositorioDemo();
  return montarContexto(repo, sessao);
}

export type { ContextoSessao };
