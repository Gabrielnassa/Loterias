import { aparelhoAceita, telasEfetivas, TELA_DA_CATEGORIA, type AlertaAviso } from '@radar/core';
import type { EnviarPush, MembroDestino, RepositorioAvisos } from './tipos';

/**
 * Leva um alerta a quem deve recebê-lo: cria a notificação na central de cada pessoa (uma vez por
 * `chave`) e manda push para os aparelhos dela cuja preferência aceita a categoria.
 * Conta: só quem abre a tela da categoria e vê a loja do alerta (colaborador restrito).
 */
export type Alvo = { contaId: string } | { usuarios: readonly { usuarioId: string; contaId: string | null }[] };

export function recebe(m: MembroDestino, alerta: Pick<AlertaAviso, 'categoria' | 'lotericaCodigo'>): boolean {
  const tela = TELA_DA_CATEGORIA[alerta.categoria];
  if (tela && !telasEfetivas(m).includes(tela)) return false;
  if (alerta.lotericaCodigo && m.papel === 'colaborador' && m.lojas && !m.lojas.includes(alerta.lotericaCodigo)) {
    // a loja restrita vale para alertas da PRÓPRIA lotérica; monitoradas são de terceiros
    if (alerta.categoria !== 'monitorada-abertura') return false;
  }
  return true;
}

export interface ResultadoDespacho {
  notificacoes: number;
  pushes: number;
}

export async function despachar(repo: RepositorioAvisos, alerta: AlertaAviso, alvo: Alvo, enviar: EnviarPush | null): Promise<ResultadoDespacho> {
  const pessoas =
    'contaId' in alvo
      ? (await repo.membrosDaConta(alvo.contaId)).filter((m) => recebe(m, alerta)).map((m) => ({ usuarioId: m.usuarioId, contaId: alvo.contaId as string | null }))
      : alvo.usuarios;
  let notificacoes = 0;
  let pushes = 0;
  for (const p of pessoas) {
    const n = await repo.criarNotificacao({
      usuarioId: p.usuarioId,
      contaId: p.contaId,
      categoria: alerta.categoria,
      titulo: alerta.titulo,
      corpo: alerta.corpo,
      url: alerta.url,
      chave: alerta.chave,
      criadoEm: alerta.em,
    });
    if (!n) continue;
    notificacoes++;
    if (!enviar) continue;
    let enviados = 0;
    for (const ap of await repo.aparelhos(p.usuarioId)) {
      if (!aparelhoAceita(ap.preferencias, alerta)) continue;
      const r = await enviar(ap, { titulo: alerta.titulo, corpo: alerta.corpo, url: alerta.url, chave: alerta.chave, categoria: alerta.categoria }).catch(() => 'falha' as const);
      await repo.registrarEnvio(ap.id, r, new Date());
      if (r === 'ok') enviados++;
    }
    if (enviados) {
      await repo.contarEnvio(n.id, enviados);
      pushes += enviados;
    }
  }
  return { notificacoes, pushes };
}
