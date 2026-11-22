import { headers } from 'next/headers';
import { CABECALHO_CONTEXTO, decodificarContexto, type ContextoSessao } from './contas/sessao';

/**
 * Quem está logado nesta requisição (o middleware valida a sessão e manda o contexto num cabeçalho
 * interno; o cabeçalho que vier do navegador é sempre descartado). null = contas desligadas ou fora de
 * uma requisição (testes, scripts).
 */
export async function contexto(): Promise<ContextoSessao | null> {
  try {
    return decodificarContexto((await headers()).get(CABECALHO_CONTEXTO));
  } catch {
    return null;
  }
}

export type { ContextoSessao };
