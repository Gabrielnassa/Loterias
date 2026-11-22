import type { RepositorioContas } from '@/lib/contas/tipos';
import { repositorioDemo } from './contas';

/**
 * Substitui apps/web/lib/contas/ativo.ts na demonstração. O repositório é carregado (async) por
 * prepararDemo antes de qualquer tela rodar; aqui ele já está pronto.
 */
let pronto: RepositorioContas | null = null;

export async function carregarContasDemo() {
  pronto = (await repositorioDemo()).repo;
}

export type ModoContas = 'desligado' | 'memoria' | 'postgres';
export const modoContas = (): ModoContas => 'memoria';

export function repositorioContas(): RepositorioContas | null {
  return pronto;
}

export function definirRepositorioContas(r: RepositorioContas | undefined) {
  pronto = r ?? null;
}
