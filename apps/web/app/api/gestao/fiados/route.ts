import { lerCorpo, responder } from '@/lib/contas/http';
import { contexto } from '@/lib/contexto';
import { fmtMoeda } from '@/lib/formato';
import { repositorioGestao } from '@/lib/gestao/ativo';
import { ErroGestao, hojeSP, lerDia, lerValor, pagarFiado, painelFiados, registrarCobranca, removerRegistro, salvarFiado } from '@/lib/gestao/servico';
import { somarDias } from '@radar/core';

export const dynamic = 'force-dynamic';

/** GET /api/gestao/fiados?loja=: fiados em aberto, cobrança do dia e quitados (30 dias). */
export async function GET(req: Request) {
  const repo = repositorioGestao();
  if (!repo) return Response.json({ erro: 'contas desligadas' }, { status: 409 });
  try {
    return Response.json(await painelFiados(repo, await contexto(), { loja: new URL(req.url).searchParams.get('loja') }));
  } catch (e) {
    if (e instanceof ErroGestao) return Response.json({ erro: e.message }, { status: 400 });
    throw e;
  }
}

/** POST /api/gestao/fiados com `acao` = novo | pagar | cobrei | remover. */
export async function POST(req: Request) {
  const repo = repositorioGestao();
  if (!repo) return responder(req, '/gestao/fiados', { erro: 'a gestão da loja precisa das contas ligadas (DATABASE_URL)' });
  const c = await lerCorpo(req);
  const ctx = await contexto();
  const hoje = hojeSP();
  try {
    switch (c.um('acao')) {
      case 'novo':
        await salvarFiado(repo, ctx, { loja: c.um('loja'), dia: lerDia(c.um('dia'), hoje), cliente: c.um('cliente'), telefone: c.um('telefone'), descricao: c.um('descricao'), valor: lerValor(c.um('valor')), vencimento: lerDia(c.um('vencimento'), somarDias(hoje, 7)) });
        return responder(req, '/gestao/fiados', { ok: 'fiado anotado' });
      case 'pagar': {
        const r = await pagarFiado(repo, ctx, { id: c.um('id'), dia: lerDia(c.um('dia'), hoje), valor: c.um('valor') ? lerValor(c.um('valor')) : null, forma: c.um('forma') });
        return responder(req, '/gestao/fiados', { ok: r.saldo > 0 ? `pagamento de ${fmtMoeda(r.valor)}; ainda faltam ${fmtMoeda(r.saldo)}` : `quitado (${fmtMoeda(r.valor)})` });
      }
      case 'cobrei':
        await registrarCobranca(repo, ctx, c.um('id'), hoje);
        return responder(req, '/gestao/fiados', { ok: 'cobrança de hoje registrada' });
      case 'remover':
        await removerRegistro(repo, ctx, 'fiado', c.um('id'));
        return responder(req, '/gestao/fiados', { ok: 'fiado removido (o nome e o telefone do cliente foram apagados)' });
      default:
        return responder(req, '/gestao/fiados', { erro: 'ação desconhecida' });
    }
  } catch (e) {
    if (e instanceof ErroGestao) return responder(req, '/gestao/fiados', { erro: e.message });
    throw e;
  }
}
