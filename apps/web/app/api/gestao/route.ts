import { lerCorpo, responder } from '@/lib/contas/http';
import { contexto } from '@/lib/contexto';
import { repositorioGestao } from '@/lib/gestao/ativo';
import { ErroGestao, hojeSP, lerDia, lerValor, pagarDespesaFixa, removerRegistro, salvarDespesaFixa, salvarLancamento } from '@/lib/gestao/servico';

export const dynamic = 'force-dynamic';

/** POST /api/gestao com `acao` = lancamento | remover-lancamento | despesa-fixa | pagar-despesa | remover-despesa-fixa. */
export async function POST(req: Request) {
  const repo = repositorioGestao();
  if (!repo) return responder(req, '/gestao', { erro: 'a gestão da loja precisa das contas ligadas (DATABASE_URL)' });
  const c = await lerCorpo(req);
  const ctx = await contexto();
  try {
    switch (c.um('acao')) {
      case 'lancamento': {
        const tipo = c.um('tipo') as 'receita' | 'despesa' | 'saldo-inicial';
        await salvarLancamento(repo, ctx, { loja: c.um('loja'), dia: lerDia(c.um('dia'), hojeSP()), dados: { tipo, categoria: tipo === 'saldo-inicial' ? 'saldo' : c.um('categoria'), descricao: c.um('descricao'), valor: lerValor(c.um('valor')), forma: c.um('forma') === 'dinheiro' ? 'dinheiro' : 'banco' } });
        return responder(req, '/gestao', { ok: 'lançamento salvo' });
      }
      case 'remover-lancamento':
        await removerRegistro(repo, ctx, 'lancamento', c.um('id'));
        return responder(req, '/gestao', { ok: 'lançamento removido' });
      case 'despesa-fixa':
        await salvarDespesaFixa(repo, ctx, { loja: c.um('loja'), descricao: c.um('descricao'), categoria: c.um('categoria'), valor: lerValor(c.um('valor')), diaVencimento: Number(c.um('dia_vencimento')) });
        return responder(req, '/gestao', { ok: 'despesa fixa cadastrada' });
      case 'pagar-despesa':
        await pagarDespesaFixa(repo, ctx, { id: c.um('id'), dia: lerDia(c.um('dia'), hojeSP()), valor: c.um('valor') ? lerValor(c.um('valor')) : null, forma: c.um('forma') });
        return responder(req, '/gestao', { ok: 'despesa paga (lançada no fluxo de caixa)' });
      case 'remover-despesa-fixa':
        await removerRegistro(repo, ctx, 'despesa-fixa', c.um('id'));
        return responder(req, '/gestao', { ok: 'despesa fixa removida' });
      default:
        return responder(req, '/gestao', { erro: 'ação desconhecida' });
    }
  } catch (e) {
    if (e instanceof ErroGestao) return responder(req, '/gestao', { erro: e.message });
    throw e;
  }
}
