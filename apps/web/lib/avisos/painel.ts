import {
  alertaResumoSemanal,
  alertasDeAbertura,
  metricasSemanais,
  normalizarCodigoLoterica,
  resumoSemanalDevido,
  semanaSP,
  type AlertaAviso,
  type LotericaRef,
} from '@radar/core';
import { despachar } from '@radar/avisos/despachar';
import type { RepositorioAvisos } from '@radar/avisos/tipos';
import type { ContextoSessao } from '@/lib/contas/sessao';
import type { FonteDadosRaioX } from '@/lib/dados';

/**
 * Monitoradas (watchlist) e central de notificações no web. Os alertas reais saem do worker; com a
 * fonte simulada (demonstração, RADAR_AUTH=memoria) eles são gerados aqui, pelas MESMAS funções do core,
 * a partir das aberturas simuladas.
 */
export class ErroAvisos extends Error {}

function exigirConta(ctx: ContextoSessao | null): asserts ctx is ContextoSessao & { conta: { id: string; nome: string } } {
  if (!ctx?.conta) throw new ErroAvisos('entre numa conta primeiro');
}

export async function monitorar(repo: RepositorioAvisos, fonte: FonteDadosRaioX, ctx: ContextoSessao | null, d: { codigo: string; apelido?: string | null }): Promise<LotericaRef> {
  exigirConta(ctx);
  const bruto = String(d.codigo ?? '').trim();
  // o código vem da própria busca (forma do banco) ou digitado em qualquer forma (21.002894-7)
  const l = (bruto ? await fonte.loterica(bruto) : null) ?? (normalizarCodigoLoterica(bruto) ? await fonte.loterica(normalizarCodigoLoterica(bruto)!) : null);
  if (!bruto || (!l && !normalizarCodigoLoterica(bruto))) throw new ErroAvisos('código de lotérica inválido');
  if (!l) throw new ErroAvisos('lotérica não encontrada na vitrine (ainda sem bolões vistos pelo coletor)');
  const limite = ctx.plano?.limites.monitoradas ?? 50;
  const atuais = await repo.monitoradas(ctx.conta.id);
  if (!atuais.some((m) => m.codigo === l.codigoCaixa) && atuais.length >= limite) {
    throw new ErroAvisos(`o plano ${ctx.plano?.nome ?? ''} permite ${limite} monitoradas: troque de plano em Plano`.replace('  ', ' '));
  }
  await repo.monitorar({ contaId: ctx.conta.id, codigo: l.codigoCaixa, apelido: d.apelido?.trim() || null });
  return l;
}

export async function deixarDeMonitorar(repo: RepositorioAvisos, ctx: ContextoSessao | null, codigo: string): Promise<void> {
  exigirConta(ctx);
  await repo.deixarDeMonitorar(ctx.conta.id, codigo);
}

/** Tela Monitoradas: cada lotérica com a semana atual e a última entrada na abertura. */
export async function painelMonitoradas(repo: RepositorioAvisos, fonte: FonteDadosRaioX, ctx: ContextoSessao | null) {
  exigirConta(ctx);
  const agora = fonte.agora();
  const [lista, aberturas, participacoes] = await Promise.all([repo.monitoradas(ctx.conta.id), fonte.aberturas(), fonte.participacoes()]);
  const porId = new Map(aberturas.map((a) => [a.id, a]));
  const linhas = await Promise.all(
    lista.map(async (m) => {
      const loterica = (await fonte.loterica(m.codigo)) ?? { codigoCaixa: m.codigo, nome: `Lotérica ${m.codigo}`, cidade: '', uf: '' };
      const semana = metricasSemanais(m.codigo, aberturas, participacoes, { ate: agora, semanas: 1, escopo: 'uf' })[0] ?? null;
      const ultima = participacoes
        .filter((p) => p.lotericaCodigo === m.codigo && porId.has(p.aberturaId))
        .sort((a, b) => b.primeiroEm.getTime() - a.primeiroEm.getTime())[0];
      return {
        codigo: m.codigo,
        apelido: m.apelido,
        loterica,
        semana,
        ultima: ultima ? { ...ultima, abertura: porId.get(ultima.aberturaId)! } : null,
      };
    }),
  );
  return { agora, semana: semanaSP(agora), linhas };
}

/**
 * Sem worker (fonte simulada): gera na hora os alertas de abertura das monitoradas (últimos 7 dias)
 * e o resumo semanal, e entrega pela central. Idempotente (chave por alerta).
 */
export async function sincronizarAlertasSimulados(repo: RepositorioAvisos, fonte: FonteDadosRaioX, ctx: ContextoSessao | null): Promise<number> {
  if (fonte.tipo !== 'simulada' || !ctx?.conta) return 0;
  const agora = fonte.agora();
  const lista = await repo.monitoradas(ctx.conta.id);
  if (!lista.length) return 0;
  const codigos = new Set(lista.map((m) => m.codigo));
  const [aberturas, participacoes] = await Promise.all([fonte.aberturas(), fonte.participacoes()]);
  const porId = new Map(aberturas.map((a) => [a.id, a]));
  const lots = new Map<string, LotericaRef>();
  for (const c of codigos) {
    const l = await fonte.loterica(c);
    if (l) lots.set(c, l);
  }
  const desde = agora.getTime() - 7 * 86_400_000;
  const alertas: AlertaAviso[] = alertasDeAbertura(
    participacoes
      .filter((p) => codigos.has(p.lotericaCodigo) && p.primeiroEm.getTime() >= desde && p.primeiroEm.getTime() <= agora.getTime() && porId.has(p.aberturaId) && lots.has(p.lotericaCodigo))
      .map((p) => {
        const a = porId.get(p.aberturaId)!;
        return { loterica: lots.get(p.lotericaCodigo)!, aberturaId: a.id, modalidade: a.modalidade, concurso: Number(a.id.split('-').at(-1)), t0: a.t0, entrouEm: p.primeiroEm, posUf: p.posUf, posCidade: p.posCidade };
      }),
  );
  const r = resumoSemanalDevido(agora);
  if (r.devido) {
    const ate = new Date(new Date(`${r.semana}T03:00:00Z`).getTime() + 7 * 86_400_000 - 1);
    const linhas = [...lots.entries()].map(([codigo, loterica]) => ({ loterica, m: metricasSemanais(codigo, aberturas, participacoes, { ate, semanas: 1, escopo: 'uf' })[0]! })).filter((l) => l.m);
    const resumo = alertaResumoSemanal(r.semana, linhas, r.enviarEm);
    if (resumo) alertas.push(resumo);
  }
  let n = 0;
  for (const a of alertas) n += (await despachar(repo, a, { contaId: ctx.conta.id }, null)).notificacoes;
  return n;
}
