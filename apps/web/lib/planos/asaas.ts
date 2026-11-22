/**
 * Asaas (cobrança recorrente): SÓ SANDBOX. A URL de produção não existe neste código; a chave vem de
 * ASAAS_API_KEY (no .env do servidor, nunca no repositório) e chaves de produção são recusadas.
 * Sem chave, vale o "Asaas simulado" (desenvolvimento e demonstração): mesmas respostas, nada sai daqui.
 * O cartão é digitado na página do próprio Asaas (link da cobrança); nenhum dado de cartão passa pelo Radar.
 */
export const ASAAS_SANDBOX = 'https://api-sandbox.asaas.com/v3';

export type FormaAsaas = 'PIX' | 'CREDIT_CARD';

export interface CobrancaAsaas {
  id: string;
  valor: number;
  vencimento: string;
  status: string;
  forma: string | null;
  link: string | null;
  pagoEm: string | null;
}

export interface PixAsaas {
  imagemBase64: string;
  copiaECola: string;
  expira: string | null;
}

export interface AsaasCliente {
  readonly modo: 'sandbox' | 'simulado';
  criarCliente(d: { nome: string; cpfCnpj: string; email: string; referencia: string }): Promise<{ id: string }>;
  criarAssinatura(d: { cliente: string; forma: FormaAsaas; valor: number; vencimento: string; descricao: string; referencia: string }): Promise<{ id: string }>;
  atualizarAssinatura(id: string, d: { valor: number; descricao: string; forma: FormaAsaas }): Promise<void>;
  cancelarAssinatura(id: string): Promise<void>;
  cobrancasDaAssinatura(id: string): Promise<CobrancaAsaas[]>;
  pixQrCode(cobrancaId: string): Promise<PixAsaas | null>;
}

export class ErroAsaas extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem);
  }
}

type Pagamento = { id: string; value: number; dueDate: string; status: string; billingType?: string; invoiceUrl?: string; paymentDate?: string | null; confirmedDate?: string | null };
const paraCobranca = (p: Pagamento): CobrancaAsaas => ({
  id: p.id,
  valor: Number(p.value),
  vencimento: p.dueDate,
  status: p.status,
  forma: p.billingType ?? null,
  link: p.invoiceUrl ?? null,
  pagoEm: p.paymentDate ?? p.confirmedDate ?? null,
});

export class AsaasSandbox implements AsaasCliente {
  readonly modo = 'sandbox' as const;
  constructor(
    private readonly chave: string,
    private readonly buscar: typeof fetch = globalThis.fetch,
  ) {
    if (/^\$aact_prod_/.test(chave)) throw new ErroAsaas('chave de PRODUÇÃO do Asaas: este sistema está liberado só para o sandbox');
  }

  private async chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const r = await this.buscar(`${ASAAS_SANDBOX}${caminho}`, {
      method: metodo,
      headers: { access_token: this.chave, 'content-type': 'application/json', 'user-agent': 'radar-loterico' },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
    const texto = await r.text();
    const j = texto ? (JSON.parse(texto) as { errors?: { description?: string }[] } & T) : ({} as T);
    if (!r.ok) throw new ErroAsaas((j as { errors?: { description?: string }[] }).errors?.map((e) => e.description).join('; ') || `Asaas respondeu ${r.status}`, r.status);
    return j as T;
  }

  async criarCliente(d: { nome: string; cpfCnpj: string; email: string; referencia: string }) {
    return this.chamar<{ id: string }>('POST', '/customers', { name: d.nome, cpfCnpj: d.cpfCnpj.replace(/\D/g, ''), email: d.email, externalReference: d.referencia, notificationDisabled: false });
  }
  async criarAssinatura(d: { cliente: string; forma: FormaAsaas; valor: number; vencimento: string; descricao: string; referencia: string }) {
    return this.chamar<{ id: string }>('POST', '/subscriptions', { customer: d.cliente, billingType: d.forma, value: d.valor, nextDueDate: d.vencimento, cycle: 'MONTHLY', description: d.descricao, externalReference: d.referencia });
  }
  async atualizarAssinatura(id: string, d: { valor: number; descricao: string; forma: FormaAsaas }) {
    await this.chamar('POST', `/subscriptions/${encodeURIComponent(id)}`, { value: d.valor, description: d.descricao, billingType: d.forma, updatePendingPayments: true });
  }
  async cancelarAssinatura(id: string) {
    await this.chamar('DELETE', `/subscriptions/${encodeURIComponent(id)}`);
  }
  async cobrancasDaAssinatura(id: string) {
    const r = await this.chamar<{ data: Pagamento[] }>('GET', `/subscriptions/${encodeURIComponent(id)}/payments`);
    return (r.data ?? []).map(paraCobranca);
  }
  async pixQrCode(cobrancaId: string) {
    const r = await this.chamar<{ encodedImage?: string; payload?: string; expirationDate?: string }>('GET', `/payments/${encodeURIComponent(cobrancaId)}/pixQrCode`);
    return r.encodedImage && r.payload ? { imagemBase64: r.encodedImage, copiaECola: r.payload, expira: r.expirationDate ?? null } : null;
  }
}

/** Asaas de mentira: guarda em memória e devolve no mesmo formato (a página de pagamento é a /planos). */
export class AsaasSimulado implements AsaasCliente {
  readonly modo = 'simulado' as const;
  private seq = 0;
  private readonly assinaturas = new Map<string, { valor: number; forma: FormaAsaas; vencimento: string; ativa: boolean; pagamentos: CobrancaAsaas[] }>();

  private id(prefixo: string) {
    return `sim_${prefixo}_${Date.now().toString(36)}${(++this.seq).toString(36)}`;
  }
  async criarCliente() {
    return { id: this.id('cus') };
  }
  async criarAssinatura(d: { forma: FormaAsaas; valor: number; vencimento: string }) {
    const id = this.id('sub');
    const pagamento: CobrancaAsaas = { id: this.id('pay'), valor: d.valor, vencimento: d.vencimento, status: 'PENDING', forma: d.forma, link: null, pagoEm: null };
    this.assinaturas.set(id, { valor: d.valor, forma: d.forma, vencimento: d.vencimento, ativa: true, pagamentos: [pagamento] });
    return { id };
  }
  async atualizarAssinatura(id: string, d: { valor: number; forma: FormaAsaas }) {
    const a = this.assinaturas.get(id);
    if (!a) return;
    a.valor = d.valor;
    a.forma = d.forma;
    for (const p of a.pagamentos) if (p.status === 'PENDING') Object.assign(p, { valor: d.valor, forma: d.forma });
  }
  async cancelarAssinatura(id: string) {
    const a = this.assinaturas.get(id);
    if (a) a.ativa = false;
  }
  async cobrancasDaAssinatura(id: string) {
    return (this.assinaturas.get(id)?.pagamentos ?? []).map((p) => ({ ...p }));
  }
  async pixQrCode() {
    return null;
  }
}

const GLOBAL = globalThis as unknown as { __radarAsaas?: AsaasCliente };

export function asaasAtivo(): AsaasCliente {
  if (!GLOBAL.__radarAsaas) {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    if (env.ASAAS_AMBIENTE && env.ASAAS_AMBIENTE !== 'sandbox') throw new ErroAsaas('ASAAS_AMBIENTE: só "sandbox" está liberado');
    GLOBAL.__radarAsaas = env.ASAAS_API_KEY ? new AsaasSandbox(env.ASAAS_API_KEY) : new AsaasSimulado();
  }
  return GLOBAL.__radarAsaas;
}

export function definirAsaas(a: AsaasCliente | undefined) {
  GLOBAL.__radarAsaas = a;
}
