import { estadoAvisosVazio, lerEstadoAvisos, RepositorioAvisosMemoria, type EstadoAvisos } from '@radar/avisos/memoria';
import type { RepositorioAvisos } from '@radar/avisos/tipos';
import { lerPreferencias } from '@radar/core';
import { membrosDaMemoria } from '@/lib/avisos/membros';
import { repositorioDemo } from './contas';
import { fonteDeDados } from './fonte-dados';

/**
 * Substitui apps/web/lib/avisos/ativo.ts na demonstração: monitoradas, aparelhos e central em memória,
 * guardados no localStorage. Começa monitorando as 3 lotéricas simuladas que mais abriram e com um
 * aparelho de EXEMPLO (para mostrar as preferências por aparelho; o push de verdade precisa do servidor).
 */
const CHAVE = 'radar-demo-avisos-v1';
let repo: RepositorioAvisosMemoria | null = null;

function salvar(e: EstadoAvisos) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(e));
  } catch {
    // sem localStorage: segue em memória
  }
}

export async function carregarAvisosDemo() {
  const { repo: contas, sessao } = await repositorioDemo();
  let estado: EstadoAvisos | null = null;
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo) estado = lerEstadoAvisos(salvo);
  } catch {
    estado = null;
  }
  if (estado && !estado.monitoradas.every((m) => m.contaId === sessao.contaId)) estado = null;
  repo = new RepositorioAvisosMemoria(membrosDaMemoria(contas), estado ?? estadoAvisosVazio(), salvar);
  if (!estado) {
    const fonte = fonteDeDados();
    const conta = new Map<string, number>();
    for (const p of await fonte.participacoes()) conta.set(p.lotericaCodigo, (conta.get(p.lotericaCodigo) ?? 0) + 1);
    const minhas = new Set((await contas.lojas(sessao.contaId)).map((l) => l.codigo));
    const top = [...conta.entries()].filter(([k]) => !minhas.has(k)).sort((a, b) => b[1] - a[1]).slice(0, 3);
    for (const [codigo] of top) await repo.monitorar({ contaId: sessao.contaId, codigo });
    await repo.salvarAparelho({
      usuarioId: sessao.usuarioId,
      endpoint: 'https://exemplo.invalid/aparelho-da-demonstracao',
      p256dh: 'exemplo',
      auth: 'exemplo',
      nome: 'Celular de exemplo (demonstração)',
      preferencias: lerPreferencias({ vendas: 'hoje' }),
    });
  }
}

export function repositorioAvisos(): RepositorioAvisos | null {
  return repo;
}

export const chavePublicaVapid = (): string | null => null;

export { membrosDaMemoria };

export function definirRepositorioAvisos(r: RepositorioAvisos | undefined) {
  repo = (r as RepositorioAvisosMemoria) ?? null;
}
