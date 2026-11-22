import { timingSafeEqual } from 'node:crypto';
import { repositorioContas } from '@/lib/contas/ativo';
import { processarWebhook } from '@/lib/planos/cobranca';

export const dynamic = 'force-dynamic';

const igual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * POST /api/webhooks/asaas: eventos de pagamento e assinatura do Asaas (sandbox). O Asaas manda o token
 * configurado no painel dele no cabeçalho `asaas-access-token`; aqui ele é comparado com
 * ASAAS_WEBHOOK_TOKEN (do .env, nunca do repositório). Sem token configurado, o webhook fica desligado.
 * Responde 200 mesmo para eventos ignorados (o Asaas pausa a fila depois de erros seguidos).
 */
export async function POST(req: Request) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado) return Response.json({ erro: 'webhook desligado: defina ASAAS_WEBHOOK_TOKEN' }, { status: 503 });
  if (!igual(req.headers.get('asaas-access-token') ?? '', esperado)) return Response.json({ erro: 'token inválido' }, { status: 401 });
  const repo = repositorioContas();
  if (!repo) return Response.json({ erro: 'contas desligadas' }, { status: 503 });
  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo !== 'object') return Response.json({ erro: 'corpo inválido' }, { status: 400 });
  try {
    return Response.json({ recebido: true, ...(await processarWebhook(repo, corpo, new Date())) });
  } catch (e) {
    console.error('[asaas] falha ao processar o webhook', e);
    return Response.json({ recebido: true, erro: 'falha registrada' });
  }
}
