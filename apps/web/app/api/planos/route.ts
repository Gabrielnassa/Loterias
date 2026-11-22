import { repositorioContas } from '@/lib/contas/ativo';
import { lerCorpo, responder } from '@/lib/contas/http';
import { contexto } from '@/lib/contexto';
import { asaasAtivo } from '@/lib/planos/asaas';
import { assinar, cancelar, ErroPlano, nomeDoPlano, painelPlano, simularPagamento } from '@/lib/planos/cobranca';
import type { PlanoId } from '@radar/core';

export const dynamic = 'force-dynamic';

/** GET /api/planos: assinatura, plano que vale agora e cobranças da conta (só o responsável). */
export async function GET() {
  const repo = repositorioContas();
  if (!repo) return Response.json({ erro: 'contas desligadas' }, { status: 409 });
  try {
    return Response.json(await painelPlano(repo, asaasAtivo(), await contexto(), new Date()));
  } catch (e) {
    if (e instanceof ErroPlano) return Response.json({ erro: e.message }, { status: 403 });
    throw e;
  }
}

/** POST /api/planos com `acao` = assinar (plano, forma PIX|CREDIT_CARD, cpf_cnpj, nome) | cancelar | simular-pagamento (cobranca). */
export async function POST(req: Request) {
  const repo = repositorioContas();
  if (!repo) return responder(req, '/planos', { erro: 'contas desligadas' });
  const c = await lerCorpo(req);
  const ctx = await contexto();
  const agora = new Date();
  try {
    switch (c.um('acao')) {
      case 'assinar': {
        const r = await assinar(repo, asaasAtivo(), ctx, { plano: c.um('plano'), forma: c.um('forma'), cpfCnpj: c.um('cpf_cnpj'), nome: c.um('nome') }, agora);
        const nome = nomeDoPlano(c.um('plano') as PlanoId);
        return responder(req, '/planos', {
          ok: r.cobranca ? `plano ${nome} assinado: a cobrança de ${r.cobranca.vencimento.split('-').reverse().join('/')} está abaixo` : `plano ${nome} assinado`,
          ...(r.cobranca?.link ? { link: r.cobranca.link } : {}),
        });
      }
      case 'cancelar':
        await cancelar(repo, asaasAtivo(), ctx, agora);
        return responder(req, '/planos', { ok: 'assinatura cancelada: o plano vale até o fim do período pago' });
      case 'simular-pagamento': {
        const r = await simularPagamento(repo, asaasAtivo(), ctx, c.um('cobranca'), agora);
        return responder(req, '/planos', r.aplicado ? { ok: 'pagamento simulado confirmado' } : { erro: r.motivo ?? 'não aplicado' });
      }
      default:
        return responder(req, '/planos', { erro: 'ação desconhecida' });
    }
  } catch (e) {
    if (e instanceof ErroPlano) return responder(req, '/planos', { erro: e.message });
    throw e;
  }
}
