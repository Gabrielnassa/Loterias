import {
  aplicarEventoAsaas,
  assinaturaInicial,
  cpfCnpjValido,
  diaSP,
  ehPlano,
  plano as dadosDoPlano,
  planoEfetivo,
  PLANOS,
  primeiroVencimento,
  type Assinatura,
  type PlanoId,
} from '@radar/core';
import type { ContextoSessao } from '@/lib/contas/sessao';
import type { Cobranca, RepositorioContas } from '@/lib/contas/tipos';
import { ErroAsaas, type AsaasCliente, type CobrancaAsaas, type FormaAsaas, type PixAsaas } from './asaas';

/**
 * Plano e cobrança da conta: assinar (ou trocar de plano), cancelar e aplicar os eventos do webhook.
 * Só o responsável mexe (tela "plano").
 */
export class ErroPlano extends Error {}

function exigirResponsavel(ctx: ContextoSessao | null): asserts ctx is ContextoSessao & { conta: { id: string; nome: string } } {
  if (!ctx?.conta) throw new ErroPlano('entre numa conta primeiro');
  if (ctx.papel !== 'responsavel') throw new ErroPlano('só o responsável da conta cuida do plano');
}

const paraLocal = (contaId: string, assinaturaId: string, c: CobrancaAsaas): Cobranca => ({
  id: c.id,
  contaId,
  asaasAssinaturaId: assinaturaId,
  valor: c.valor,
  vencimento: c.vencimento,
  status: c.status,
  forma: c.forma,
  link: c.link,
  pagoEm: c.pagoEm ? new Date(c.pagoEm) : null,
});

async function assinaturaDaConta(repo: RepositorioContas, contaId: string): Promise<Assinatura> {
  const a = await repo.assinatura(contaId);
  if (a) return a;
  const conta = await repo.conta(contaId);
  return assinaturaInicial(contaId, conta?.criadoEm ?? new Date());
}

export interface DadosAssinar {
  plano: string;
  forma: string;
  cpfCnpj: string;
  nome?: string | null;
}

/** Assina (ou troca de plano). A 1ª cobrança vence no fim do teste grátis, se ainda estiver nele. */
export async function assinar(repo: RepositorioContas, asaas: AsaasCliente, ctx: ContextoSessao | null, d: DadosAssinar, agora: Date): Promise<{ cobranca: Cobranca | null; pix: PixAsaas | null }> {
  exigirResponsavel(ctx);
  if (!ehPlano(d.plano) || d.plano === 'gratis') throw new ErroPlano('escolha um plano pago');
  const forma: FormaAsaas = d.forma === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX';
  const p = dadosDoPlano(d.plano);
  const descricao = `Radar Lotérico, plano ${p.nome} (${ctx.conta.nome})`;
  let a = await assinaturaDaConta(repo, ctx.conta.id);
  try {
    if (a.asaasAssinaturaId && a.status !== 'cancelada') {
      await asaas.atualizarAssinatura(a.asaasAssinaturaId, { valor: p.precoMensal, descricao, forma });
      a = { ...a, plano: d.plano, forma, valor: p.precoMensal };
    } else {
      const cpf = d.cpfCnpj.replace(/\D/g, '');
      if (!cpfCnpjValido(cpf)) throw new ErroPlano('CPF ou CNPJ inválido (o Asaas exige para emitir a cobrança)');
      const clienteId = a.asaasClienteId ?? (await asaas.criarCliente({ nome: (d.nome ?? '').trim() || ctx.conta.nome, cpfCnpj: cpf, email: ctx.usuario.email, referencia: ctx.conta.id })).id;
      const vencimento = diaSP(primeiroVencimento(a, agora));
      const sub = await asaas.criarAssinatura({ cliente: clienteId, forma, valor: p.precoMensal, vencimento, descricao, referencia: ctx.conta.id });
      a = { ...a, plano: d.plano, forma, valor: p.precoMensal, asaasClienteId: clienteId, asaasAssinaturaId: sub.id, status: a.status === 'teste' && a.testeAte && a.testeAte > agora ? 'teste' : 'ativa', canceladaEm: null };
    }
    await repo.salvarAssinatura(a);
    const cobrancas = await asaas.cobrancasDaAssinatura(a.asaasAssinaturaId!);
    for (const c of cobrancas) await repo.salvarCobranca(paraLocal(ctx.conta.id, a.asaasAssinaturaId!, c));
    const pendente = cobrancas.find((c) => c.status === 'PENDING') ?? null;
    const pix = pendente && forma === 'PIX' ? await asaas.pixQrCode(pendente.id).catch(() => null) : null;
    return { cobranca: pendente ? paraLocal(ctx.conta.id, a.asaasAssinaturaId!, pendente) : null, pix };
  } catch (e) {
    if (e instanceof ErroAsaas) throw new ErroPlano(`Asaas: ${e.message}`);
    throw e;
  }
}

/** Cancela no Asaas; o plano vale até o fim do período já pago. */
export async function cancelar(repo: RepositorioContas, asaas: AsaasCliente, ctx: ContextoSessao | null, agora: Date): Promise<void> {
  exigirResponsavel(ctx);
  const a = await assinaturaDaConta(repo, ctx.conta.id);
  if (!a.asaasAssinaturaId || a.status === 'cancelada') throw new ErroPlano('não há assinatura ativa');
  await asaas.cancelarAssinatura(a.asaasAssinaturaId).catch((e: unknown) => {
    throw new ErroPlano(`Asaas: ${(e as Error).message}`);
  });
  await repo.salvarAssinatura(aplicarEventoAsaas(a, 'SUBSCRIPTION_DELETED', null, agora));
}

type CorpoWebhook = {
  id?: string;
  event?: string;
  payment?: { id: string; subscription?: string | null; value: number; dueDate: string; status: string; billingType?: string; invoiceUrl?: string; paymentDate?: string | null; confirmedDate?: string | null };
  subscription?: { id: string };
};

/**
 * Evento do webhook do Asaas (já autenticado pelo token). Idempotente: o mesmo evento não é aplicado duas
 * vezes. Atualiza a cobrança e a assinatura da conta dona da assinatura no Asaas.
 */
export async function processarWebhook(repo: RepositorioContas, corpo: CorpoWebhook, agora: Date): Promise<{ aplicado: boolean; motivo?: string }> {
  const evento = corpo.event ?? '';
  const pagamento = corpo.payment;
  const assinaturaId = pagamento?.subscription ?? corpo.subscription?.id ?? null;
  const chave = corpo.id ?? `${evento}:${pagamento?.id ?? assinaturaId ?? ''}:${pagamento?.status ?? ''}`;
  if (!evento) return { aplicado: false, motivo: 'sem evento' };
  if (!(await repo.registrarWebhook(chave, evento, corpo))) return { aplicado: false, motivo: 'repetido' };
  try {
    if (!assinaturaId) {
      await repo.marcarWebhook(chave, 'sem assinatura (cobrança avulsa): ignorado');
      return { aplicado: false, motivo: 'sem assinatura' };
    }
    const contaId = await repo.contaPorAssinaturaAsaas(assinaturaId);
    if (!contaId) {
      await repo.marcarWebhook(chave, 'assinatura desconhecida');
      return { aplicado: false, motivo: 'assinatura desconhecida' };
    }
    if (pagamento) {
      await repo.salvarCobranca({
        id: pagamento.id,
        contaId,
        asaasAssinaturaId: assinaturaId,
        valor: Number(pagamento.value),
        vencimento: pagamento.dueDate,
        status: pagamento.status,
        forma: pagamento.billingType ?? null,
        link: pagamento.invoiceUrl ?? null,
        pagoEm: pagamento.paymentDate || pagamento.confirmedDate ? new Date(`${(pagamento.paymentDate ?? pagamento.confirmedDate)!.slice(0, 10)}T12:00:00Z`) : null,
      });
    }
    const a = await assinaturaDaConta(repo, contaId);
    await repo.salvarAssinatura(aplicarEventoAsaas(a, evento, pagamento ? { vencimento: new Date(`${pagamento.dueDate}T03:00:00Z`) } : null, agora));
    await repo.marcarWebhook(chave, null);
    return { aplicado: true };
  } catch (e) {
    await repo.marcarWebhook(chave, (e as Error).message);
    throw e;
  }
}

/** Só no modo simulado: finge que o Asaas confirmou o pagamento (para testar o fluxo sem o sandbox). */
export async function simularPagamento(repo: RepositorioContas, asaas: AsaasCliente, ctx: ContextoSessao | null, cobrancaId: string, agora: Date) {
  exigirResponsavel(ctx);
  if (asaas.modo !== 'simulado') throw new ErroPlano('simular pagamento só existe sem o Asaas configurado');
  const c = (await repo.cobrancas(ctx.conta.id)).find((x) => x.id === cobrancaId);
  if (!c) throw new ErroPlano('cobrança não encontrada');
  return processarWebhook(
    repo,
    {
      id: `sim_evt_${cobrancaId}_${agora.getTime()}`,
      event: 'PAYMENT_RECEIVED',
      payment: { id: c.id, subscription: c.asaasAssinaturaId, value: c.valor, dueDate: c.vencimento, status: 'RECEIVED', billingType: c.forma ?? 'PIX', paymentDate: diaSP(agora) },
    },
    agora,
  );
}

/** Tudo que a tela Plano mostra. */
export async function painelPlano(repo: RepositorioContas, asaas: AsaasCliente, ctx: ContextoSessao | null, agora: Date) {
  exigirResponsavel(ctx);
  const a = await assinaturaDaConta(repo, ctx.conta.id);
  const cobrancas = await repo.cobrancas(ctx.conta.id);
  const pendente = cobrancas.find((c) => c.status === 'PENDING' || c.status === 'OVERDUE') ?? null;
  const pix = pendente && pendente.forma === 'PIX' && asaas.modo === 'sandbox' ? await asaas.pixQrCode(pendente.id).catch(() => null) : null;
  return { assinatura: a, efetivo: planoEfetivo(a, agora), planos: PLANOS, cobrancas, pendente, pix, modo: asaas.modo };
}

export const nomeDoPlano = (id: PlanoId) => dadosDoPlano(id).nome;
