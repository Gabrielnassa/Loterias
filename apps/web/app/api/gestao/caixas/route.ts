import { lerCorpo, responder } from '@/lib/contas/http';
import { contexto } from '@/lib/contexto';
import { fmtMoeda } from '@/lib/formato';
import { repositorioGestao } from '@/lib/gestao/ativo';
import { ErroGestao, hojeSP, lerDia, lerValor, painelCaixas, registrarCarroForte, removerRegistro, salvarCaixa, salvarFechamento } from '@/lib/gestao/servico';

export const dynamic = 'force-dynamic';

/** GET /api/gestao/caixas?loja=&dia=: caixas, fechamentos do dia, quebras de 30 dias e cofre. */
export async function GET(req: Request) {
  const repo = repositorioGestao();
  if (!repo) return Response.json({ erro: 'contas desligadas' }, { status: 409 });
  const s = new URL(req.url).searchParams;
  try {
    return Response.json(await painelCaixas(repo, await contexto(), { loja: s.get('loja'), dia: s.get('dia') }));
  } catch (e) {
    if (e instanceof ErroGestao) return Response.json({ erro: e.message }, { status: 400 });
    throw e;
  }
}

/** POST /api/gestao/caixas com `acao` = fechar | caixa | remover-caixa | carro-forte | remover-carro-forte. */
export async function POST(req: Request) {
  const repo = repositorioGestao();
  if (!repo) return responder(req, '/gestao/caixas', { erro: 'a gestão da loja precisa das contas ligadas (DATABASE_URL)' });
  const c = await lerCorpo(req);
  const ctx = await contexto();
  const voltar = `/gestao/caixas?loja=${encodeURIComponent(c.um('loja'))}&dia=${encodeURIComponent(c.um('dia'))}`;
  try {
    switch (c.um('acao')) {
      case 'fechar': {
        const r = await salvarFechamento(repo, ctx, {
          loja: c.um('loja'),
          dia: lerDia(c.um('dia'), hojeSP()),
          caixaId: c.um('caixa'),
          valores: {
            operador: c.um('operador').trim().slice(0, 40) || null,
            trocoInicial: lerValor(c.um('troco_inicial')),
            entradas: lerValor(c.um('entradas')),
            saidas: lerValor(c.um('saidas')),
            sangrias: lerValor(c.um('sangrias')),
            suprimentos: lerValor(c.um('suprimentos')),
            eletronico: lerValor(c.um('eletronico')),
            contado: lerValor(c.um('contado')),
            observacao: c.um('observacao').trim().slice(0, 200) || null,
          },
        });
        const q = r.resumo;
        return responder(req, voltar, { ok: `${r.caixa} fechado: ${q.situacao === 'ok' ? 'caixa bateu' : `${q.situacao === 'falta' ? 'falta' : 'sobra'} de ${fmtMoeda(Math.abs(q.diferenca))}`}` });
      }
      case 'caixa':
        await salvarCaixa(repo, ctx, { ...(c.um('id') ? { id: c.um('id') } : {}), loja: c.um('loja'), nome: c.um('nome'), tipo: c.um('tipo') });
        return responder(req, voltar, { ok: 'caixa salvo' });
      case 'remover-caixa':
        return responder(req, voltar, { ok: (await removerRegistro(repo, ctx, 'caixa', c.um('id'))) === 'desativado' ? 'caixa desativado (tem fechamentos guardados)' : 'caixa removido' });
      case 'carro-forte':
        await registrarCarroForte(repo, ctx, { loja: c.um('loja'), dia: lerDia(c.um('dia'), hojeSP()), tipo: c.um('tipo'), valor: lerValor(c.um('valor')), guia: c.um('guia') });
        return responder(req, voltar, { ok: 'movimento do carro-forte registrado' });
      case 'remover-carro-forte':
        await removerRegistro(repo, ctx, 'carro-forte', c.um('id'));
        return responder(req, voltar, { ok: 'movimento removido' });
      default:
        return responder(req, voltar, { erro: 'ação desconhecida' });
    }
  } catch (e) {
    if (e instanceof ErroGestao) return responder(req, voltar, { erro: e.message });
    throw e;
  }
}
