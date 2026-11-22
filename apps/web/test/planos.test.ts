import { afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { definirRepositorioContas } from '@/lib/contas/ativo';
import { estadoVazio, RepositorioContasMemoria } from '@/lib/contas/memoria';
import { CABECALHO_CONTEXTO, codificarContexto, montarContexto } from '@/lib/contas/sessao';
import { AsaasSandbox, AsaasSimulado, ASAAS_SANDBOX, ErroAsaas } from '@/lib/planos/asaas';
import { assinar, cancelar, ErroPlano, processarWebhook, simularPagamento } from '@/lib/planos/cobranca';
import { assinaturaInicial } from '@radar/core';
import { POST as webhook } from '@/app/api/webhooks/asaas/route';

const D = (s: string) => new Date(`${s}T15:00:00Z`);
const CPF = '529.982.247-25';

async function montar() {
  const repo = new RepositorioContasMemoria(estadoVazio());
  const u = await repo.criarUsuario({ email: 'dono@exemplo.com', nome: 'Dono' });
  const c = await repo.criarConta('Grupo');
  await repo.salvarMembro({ contaId: c.id, usuarioId: u.id, papel: 'responsavel', telas: null, lojas: null });
  await repo.salvarAssinatura(assinaturaInicial(c.id, D('2026-11-01')));
  const ctx = (agora: Date) => montarContexto(repo, { usuarioId: u.id, contaId: c.id }, agora);
  return { repo, u, c, ctx };
}

describe('planos e cobrança (Asaas simulado)', () => {
  it('teste grátis libera tudo; assinar no teste vence no fim; pagamento confirma; depois do teste vale o plano e bloqueia o resto', async () => {
    const { repo, c, ctx } = await montar();
    expect((await ctx(D('2026-11-05')))!.plano).toMatchObject({ id: 'gestao', motivo: 'teste', diasRestantesTeste: 10 });
    const asaas = new AsaasSimulado();
    await expect(assinar(repo, asaas, await ctx(D('2026-11-05')), { plano: 'pro', forma: 'PIX', cpfCnpj: '123' }, D('2026-11-05'))).rejects.toThrow(/CPF/);
    const r = await assinar(repo, asaas, await ctx(D('2026-11-05')), { plano: 'pro', forma: 'PIX', cpfCnpj: CPF }, D('2026-11-05'));
    expect(r.cobranca).toMatchObject({ valor: 49.9, vencimento: '2026-11-15', status: 'PENDING' });
    expect((await ctx(D('2026-11-05')))!.plano!.id).toBe('gestao'); // ainda no teste
    await simularPagamento(repo, asaas, await ctx(D('2026-11-14')), r.cobranca!.id, D('2026-11-14'));
    expect((await repo.assinatura(c.id))).toMatchObject({ status: 'ativa', plano: 'pro' });
    const depois = (await ctx(D('2026-11-20')))!;
    expect(depois.plano).toMatchObject({ id: 'pro', motivo: 'pago' });
    expect(depois.telas).toContain('mercado');
    expect(depois.bloqueadas).toEqual(expect.arrayContaining(['minha-sugestoes', 'gestao-caixa']));
    // trocar para Pro+ atualiza a assinatura existente
    await assinar(repo, asaas, depois, { plano: 'pro-mais', forma: 'CREDIT_CARD', cpfCnpj: '' }, D('2026-11-20'));
    expect(await repo.assinatura(c.id)).toMatchObject({ plano: 'pro-mais', forma: 'CREDIT_CARD', valor: 89.9 });
    // cancelar: vale até o fim do período pago
    await cancelar(repo, asaas, await ctx(D('2026-11-21')), D('2026-11-21'));
    expect((await ctx(D('2026-12-10')))!.plano!.id).toBe('pro-mais');
    expect((await ctx(D('2026-12-20')))!.plano!.id).toBe('gratis');
  });

  it('só o responsável; webhook idempotente; atraso tem tolerância e depois cai para o Grátis', async () => {
    const { repo, c, ctx } = await montar();
    const asaas = new AsaasSimulado();
    const dono = (await ctx(D('2026-11-20')))!;
    await expect(assinar(repo, asaas, { ...dono, papel: 'socio' }, { plano: 'pro', forma: 'PIX', cpfCnpj: CPF }, D('2026-11-20'))).rejects.toThrow(ErroPlano);
    await assinar(repo, asaas, dono, { plano: 'pro', forma: 'PIX', cpfCnpj: CPF }, D('2026-11-20'));
    const sub = (await repo.assinatura(c.id))!.asaasAssinaturaId!;
    const evento = { id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', subscription: sub, value: 49.9, dueDate: '2026-11-20', status: 'RECEIVED', billingType: 'PIX', paymentDate: '2026-11-20' } };
    expect(await processarWebhook(repo, evento, D('2026-11-20'))).toEqual({ aplicado: true });
    expect(await processarWebhook(repo, evento, D('2026-11-20'))).toEqual({ aplicado: false, motivo: 'repetido' });
    expect((await repo.assinatura(c.id))!.pagoAte!.toISOString().slice(0, 10)).toBe('2026-12-20');
    await processarWebhook(repo, { id: 'evt_2', event: 'PAYMENT_OVERDUE', payment: { id: 'pay_2', subscription: sub, value: 49.9, dueDate: '2026-12-20', status: 'OVERDUE' } }, D('2026-12-21'));
    expect((await ctx(D('2026-12-23')))!.plano).toMatchObject({ id: 'pro', motivo: 'tolerancia' });
    expect((await ctx(D('2026-12-27')))!.plano!.id).toBe('gratis');
    expect(await processarWebhook(repo, { id: 'evt_3', event: 'PAYMENT_RECEIVED', payment: { id: 'x', subscription: 'sub_desconhecida', value: 1, dueDate: '2026-12-01', status: 'RECEIVED' } }, D('2026-12-27'))).toMatchObject({ aplicado: false, motivo: 'assinatura desconhecida' });
    expect((await repo.cobrancas(c.id)).map((x) => x.id)).toEqual(expect.arrayContaining(['pay_1', 'pay_2']));
  });

  it('rota do webhook exige o token do Asaas (do ambiente)', async () => {
    const { repo } = await montar();
    process.env.RADAR_AUTH = 'memoria';
    definirRepositorioContas(repo);
    const pedir = (token?: string) =>
      webhook(new Request('http://x/api/webhooks/asaas', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'asaas-access-token': token } : {}) }, body: JSON.stringify({ id: 'evt_9', event: 'PAYMENT_CREATED' }) }));
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    expect((await pedir('qualquer')).status).toBe(503);
    process.env.ASAAS_WEBHOOK_TOKEN = 'token-de-teste';
    expect((await pedir('errado')).status).toBe(401);
    expect((await pedir()).status).toBe(401);
    const ok = await pedir('token-de-teste');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ recebido: true, aplicado: false, motivo: 'sem assinatura' });
  });
  afterAll(() => {
    delete process.env.RADAR_AUTH;
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    definirRepositorioContas(undefined);
  });
});

describe('Asaas sandbox (cliente HTTP)', () => {
  it('fala só com o sandbox, manda a chave no cabeçalho e recusa chave de produção', async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const falso = (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      if (url.endsWith('/customers')) return new Response(JSON.stringify({ id: 'cus_1' }), { status: 200 });
      if (url.endsWith('/subscriptions')) return new Response(JSON.stringify({ id: 'sub_1' }), { status: 200 });
      if (url.includes('/payments')) return new Response(JSON.stringify({ data: [{ id: 'pay_1', value: 49.9, dueDate: '2026-12-05', status: 'PENDING', billingType: 'PIX', invoiceUrl: 'https://sandbox.asaas.com/i/abc' }] }), { status: 200 });
      return new Response(JSON.stringify({ errors: [{ description: 'não encontrado' }] }), { status: 404 });
    }) as unknown as typeof fetch;
    const a = new AsaasSandbox('$aact_hmlg_chave_de_teste', falso);
    expect((await a.criarCliente({ nome: 'Grupo', cpfCnpj: CPF, email: 'a@b.com', referencia: 'c1' })).id).toBe('cus_1');
    await a.criarAssinatura({ cliente: 'cus_1', forma: 'PIX', valor: 49.9, vencimento: '2026-12-05', descricao: 'Radar', referencia: 'c1' });
    expect(await a.cobrancasDaAssinatura('sub_1')).toEqual([{ id: 'pay_1', valor: 49.9, vencimento: '2026-12-05', status: 'PENDING', forma: 'PIX', link: 'https://sandbox.asaas.com/i/abc', pagoEm: null }]);
    await expect(a.cancelarAssinatura('sub_x')).rejects.toThrow('não encontrado');
    expect(chamadas.every((x) => x.url.startsWith(ASAAS_SANDBOX))).toBe(true);
    expect((chamadas[0]!.init.headers as Record<string, string>).access_token).toBe('$aact_hmlg_chave_de_teste');
    expect(JSON.parse(chamadas[0]!.init.body as string)).toMatchObject({ cpfCnpj: '52998224725' });
    expect(JSON.parse(chamadas[1]!.init.body as string)).toMatchObject({ billingType: 'PIX', cycle: 'MONTHLY', nextDueDate: '2026-12-05', value: 49.9 });
    expect(() => new AsaasSandbox('$aact_prod_chave_real', falso)).toThrow(ErroAsaas);
  });
});

describe('middleware: tela fora do plano vai para Planos', () => {
  it('responsável no Grátis: /minha/sugestoes -> /planos?tela=minha-sugestoes; API 402', async () => {
    const { middleware } = await import('@/middleware');
    const { repo, c, u } = await montar();
    await repo.salvarAssinatura({ ...assinaturaInicial(c.id, D('2026-01-01')) });
    const ctx = (await montarContexto(repo, { usuarioId: u.id, contaId: c.id }, D('2026-11-20')))!;
    expect(ctx.plano!.id).toBe('gratis');
    // o middleware monta o contexto pela sessão; aqui basta o repositório com uma sessão válida
    process.env.RADAR_AUTH = 'memoria';
    definirRepositorioContas(repo);
    const { criarSessao } = await import('@/lib/contas/acesso');
    const token = await criarSessao(repo, u.id, c.id, new Date(), null);
    const r = await middleware(new NextRequest('http://localhost:3000/minha/sugestoes', { headers: { host: 'localhost:3000', cookie: `radar_sessao=${token}` } }));
    expect(r.headers.get('location')).toBe('http://localhost:3000/planos?tela=minha-sugestoes');
    const api = await middleware(new NextRequest('http://localhost:3000/api/minha/sugestoes', { headers: { host: 'localhost:3000', cookie: `radar_sessao=${token}` } }));
    expect(api.status).toBe(402);
    expect(codificarContexto(ctx).length).toBeGreaterThan(10);
    expect(CABECALHO_CONTEXTO).toBe('x-radar-contexto');
    delete process.env.RADAR_AUTH;
    definirRepositorioContas(undefined);
  });
});
