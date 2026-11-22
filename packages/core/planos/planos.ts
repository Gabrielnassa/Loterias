import { TELAS } from '../contas/permissoes';

/**
 * Planos (Fase 6): o que cada plano libera, limites, teste grátis e o estado da assinatura.
 * Preços PROVISÓRIOS (decidir com o dono do produto); valem por conta, por mês. Cobrança pelo Asaas.
 */
export const PLANOS_IDS = ['gratis', 'pro', 'pro-mais', 'gestao'] as const;
export type PlanoId = (typeof PLANOS_IDS)[number];

export interface Plano {
  id: PlanoId;
  nome: string;
  precoMensal: number;
  resumo: string;
  telas: readonly string[];
  limites: { lojas: number; pessoas: number; monitoradas: number };
}

const GRATIS = ['raio-x', 'ferramentas', 'minha-boloes', 'minha-cronometro', 'equipe', 'plano'];
const PRO = [...GRATIS, 'mercado', 'monitoradas', 'minha-financeiro', 'minha-conferencia', 'minha-posicao', 'minha-site', 'minha-midias'];
const PRO_MAIS = [...PRO, 'minha-sugestoes', 'minha-simulador'];
const GESTAO = [...PRO_MAIS, 'gestao-caixa', 'gestao-fiados', 'gestao-financeiro'];

export const PLANOS: readonly Plano[] = [
  { id: 'gratis', nome: 'Grátis', precoMensal: 0, resumo: 'Raio-X da abertura, seus bolões, cronômetro e ferramentas', telas: GRATIS, limites: { lojas: 1, pessoas: 2, monitoradas: 3 } },
  { id: 'pro', nome: 'Pro', precoMensal: 49.9, resumo: 'Mercado, monitoradas com alertas, financeiro, conferência, site e artes', telas: PRO, limites: { lojas: 2, pessoas: 5, monitoradas: 15 } },
  { id: 'pro-mais', nome: 'Pro+', precoMensal: 89.9, resumo: 'Tudo do Pro, mais sugestões de franquia e formato e o simulador de posição', telas: PRO_MAIS, limites: { lojas: 5, pessoas: 15, monitoradas: 50 } },
  { id: 'gestao', nome: 'Gestão', precoMensal: 149.9, resumo: 'Tudo do Pro+, mais a gestão da loja física: caixas, fechamento, fiados, despesas e DRE', telas: GESTAO, limites: { lojas: 10, pessoas: 40, monitoradas: 50 } },
];

export const DIAS_TESTE = 14;
export const PLANO_DO_TESTE: PlanoId = 'gestao';
/** Dias de tolerância depois do vencimento antes de cair para o Grátis. */
export const DIAS_TOLERANCIA = 5;

export const plano = (id: PlanoId): Plano => PLANOS.find((p) => p.id === id)!;
export const ehPlano = (x: unknown): x is PlanoId => PLANOS_IDS.includes(x as PlanoId);

/** O plano mais barato que libera a tela (para a tela de bloqueio dizer qual contratar). */
export function planoQueLibera(telaId: string): Plano | null {
  return PLANOS.find((p) => p.telas.includes(telaId)) ?? null;
}

export function telasDoPlano(id: PlanoId): string[] {
  const conhecidas = new Set(TELAS.map((t) => t.id));
  return plano(id).telas.filter((t) => conhecidas.has(t));
}

export type StatusAssinatura = 'teste' | 'ativa' | 'atrasada' | 'cancelada' | 'cortesia';

export interface Assinatura {
  contaId: string;
  /** Plano contratado (ou o do teste). */
  plano: PlanoId;
  status: StatusAssinatura;
  /** Fim do teste grátis. */
  testeAte: Date | null;
  /** Pago até (fim do período coberto pelo último pagamento). */
  pagoAte: Date | null;
  forma: 'PIX' | 'CREDIT_CARD' | null;
  valor: number | null;
  asaasClienteId: string | null;
  asaasAssinaturaId: string | null;
  canceladaEm: Date | null;
}

export interface PlanoEfetivo {
  id: PlanoId;
  /** Por que este plano vale agora. */
  motivo: 'teste' | 'pago' | 'tolerancia' | 'cortesia' | 'gratis';
  diasRestantesTeste: number | null;
  /** O plano contratado está pendente de pagamento (atrasado, dentro da tolerância). */
  aviso: string | null;
}

const DIA = 86_400_000;

/** Assinatura nova: teste grátis do plano mais completo por 14 dias. */
export function assinaturaInicial(contaId: string, agora: Date): Assinatura {
  return { contaId, plano: PLANO_DO_TESTE, status: 'teste', testeAte: new Date(agora.getTime() + DIAS_TESTE * DIA), pagoAte: null, forma: null, valor: null, asaasClienteId: null, asaasAssinaturaId: null, canceladaEm: null };
}

/** O plano que vale AGORA, considerando teste, pagamento, atraso (com tolerância) e cancelamento. */
export function planoEfetivo(a: Assinatura | null, agora: Date): PlanoEfetivo {
  const t = agora.getTime();
  if (!a) return { id: 'gratis', motivo: 'gratis', diasRestantesTeste: null, aviso: null };
  if (a.status === 'cortesia') return { id: a.plano, motivo: 'cortesia', diasRestantesTeste: null, aviso: null };
  const pago = a.pagoAte && a.pagoAte.getTime() > t;
  if (pago && a.status !== 'atrasada') return { id: a.plano, motivo: 'pago', diasRestantesTeste: null, aviso: a.status === 'cancelada' ? `assinatura cancelada: vale até ${a.pagoAte!.toISOString().slice(0, 10)}` : null };
  if (a.testeAte && a.testeAte.getTime() > t && a.status !== 'cancelada') {
    // no teste vale tudo (o plano escolhido passa a valer quando o teste acaba e o pagamento confirma)
    return { id: PLANO_DO_TESTE, motivo: 'teste', diasRestantesTeste: Math.ceil((a.testeAte.getTime() - t) / DIA), aviso: null };
  }
  if (a.status === 'atrasada' || (a.status === 'ativa' && a.pagoAte)) {
    const venceu = a.pagoAte ?? a.testeAte;
    if (venceu && t - venceu.getTime() <= DIAS_TOLERANCIA * DIA) {
      return { id: a.plano, motivo: 'tolerancia', diasRestantesTeste: null, aviso: `pagamento pendente: regularize em até ${Math.max(0, Math.ceil((venceu.getTime() + DIAS_TOLERANCIA * DIA - t) / DIA))} dias para não perder o plano` };
    }
  }
  return { id: 'gratis', motivo: 'gratis', diasRestantesTeste: null, aviso: a.status === 'atrasada' ? 'pagamento em atraso: o plano voltou para o Grátis' : null };
}

/** 1º vencimento ao assinar: no fim do teste (não perde os dias que faltam) ou hoje. */
export function primeiroVencimento(a: Assinatura | null, agora: Date): Date {
  return a?.testeAte && a.testeAte.getTime() > agora.getTime() && a.status === 'teste' ? a.testeAte : agora;
}

export function somarMeses(d: Date, n: number): Date {
  const x = new Date(d);
  const dia = x.getUTCDate();
  x.setUTCMonth(x.getUTCMonth() + n, 1);
  const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(dia, ultimo));
  return x;
}

/** Eventos do webhook do Asaas que mudam a assinatura. */
export type EventoAsaas =
  | 'PAYMENT_CREATED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_OVERDUE'
  | 'PAYMENT_REFUNDED'
  | 'PAYMENT_CHARGEBACK_REQUESTED'
  | 'PAYMENT_DELETED'
  | 'SUBSCRIPTION_DELETED'
  | 'SUBSCRIPTION_INACTIVATED'
  | string;

/**
 * Aplica um evento: pagamento confirmado/recebido = ativa, pago até vencimento + 1 mês; vencido = atrasada;
 * estorno/chargeback = atrasada e pago até agora; assinatura removida = cancelada (vale o que já foi pago).
 */
export function aplicarEventoAsaas(a: Assinatura, evento: EventoAsaas, pagamento: { vencimento?: Date | null } | null, agora: Date): Assinatura {
  switch (evento) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED': {
      const base = pagamento?.vencimento ?? agora;
      const ate = somarMeses(base, 1);
      return { ...a, status: a.status === 'cancelada' ? 'cancelada' : 'ativa', pagoAte: a.pagoAte && a.pagoAte.getTime() > ate.getTime() ? a.pagoAte : ate };
    }
    case 'PAYMENT_OVERDUE':
      return a.status === 'cancelada' ? a : { ...a, status: 'atrasada' };
    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_CHARGEBACK_REQUESTED':
      return { ...a, status: a.status === 'cancelada' ? 'cancelada' : 'atrasada', pagoAte: agora };
    case 'SUBSCRIPTION_DELETED':
    case 'SUBSCRIPTION_INACTIVATED':
      return { ...a, status: 'cancelada', canceladaEm: a.canceladaEm ?? agora };
    default:
      return a;
  }
}

/** CPF (11) ou CNPJ (14) com dígitos verificadores corretos. */
export function cpfCnpjValido(v: string): boolean {
  const d = v.replace(/\D/g, '');
  if (!/^\d{11}$|^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dig = (base: string, pesos: number[]) => {
    const s = pesos.reduce((acc, p, i) => acc + Number(base[i]) * p, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  if (d.length === 11) {
    const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
    const p2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    return dig(d, p1) === Number(d[9]) && dig(d, p2) === Number(d[10]);
  }
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return dig(d, p1) === Number(d[12]) && dig(d, p2) === Number(d[13]);
}
