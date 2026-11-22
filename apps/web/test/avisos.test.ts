import { describe, expect, it } from 'vitest';
import { RepositorioAvisosMemoria } from '@radar/avisos/memoria';
import { horarioSP } from '@radar/core';
import { membrosDaMemoria } from '../lib/avisos/membros';
import { ErroAvisos, monitorar, painelMonitoradas, sincronizarAlertasSimulados } from '../lib/avisos/painel';
import { estadoVazio, RepositorioContasMemoria } from '../lib/contas/memoria';
import { montarContexto } from '../lib/contas/sessao';
import { FonteSimuladaRaioX } from '../lib/dados';

// segunda-feira 09:00 (SP): o resumo da semana anterior já está devido
const AGORA = horarioSP(2026, 11, 23, 9, 0);
const fonte = new FonteSimuladaRaioX(() => AGORA, Number.POSITIVE_INFINITY, { semanas: 3, nLotericas: 300 });

describe('monitoradas e central (fonte simulada, sem worker)', () => {
  it('monitorar, painel da semana e alertas de abertura + resumo semanal na central', async () => {
    const contas = new RepositorioContasMemoria(estadoVazio());
    const u = await contas.criarUsuario({ email: 'dono@exemplo.com', nome: 'Dono' });
    const c = await contas.criarConta('Grupo');
    await contas.salvarMembro({ contaId: c.id, usuarioId: u.id, papel: 'responsavel', telas: null, lojas: null });
    const ctx = (await montarContexto(contas, { usuarioId: u.id, contaId: c.id }))!;
    const repo = new RepositorioAvisosMemoria(membrosDaMemoria(contas));
    const ls = fonte.historico().lotericas;
    // as 3 lotéricas que mais participaram
    const conta = new Map<string, number>();
    for (const p of await fonte.participacoes()) conta.set(p.lotericaCodigo, (conta.get(p.lotericaCodigo) ?? 0) + 1);
    const top = [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    for (const k of top) await monitorar(repo, fonte, ctx, { codigo: k });
    await expect(monitorar(repo, fonte, ctx, { codigo: 'abc' })).rejects.toThrow(ErroAvisos);
    const p = await painelMonitoradas(repo, fonte, ctx);
    expect(p.linhas.map((l) => l.codigo)).toEqual(top);
    expect(p.linhas.every((l) => l.ultima !== null)).toBe(true);
    const n = await sincronizarAlertasSimulados(repo, fonte, ctx);
    expect(n).toBeGreaterThan(3);
    const central = await repo.notificacoes(u.id, 200);
    expect(central.some((x) => x.categoria === 'resumo-semanal' && x.titulo.startsWith('Resumo da semana 16/11 a 22/11'))).toBe(true);
    expect(central.filter((x) => x.categoria === 'monitorada-abertura').length).toBe(n - 1);
    expect(await sincronizarAlertasSimulados(repo, fonte, ctx)).toBe(0); // idempotente
    expect(ls.length).toBe(300);
  });
});
