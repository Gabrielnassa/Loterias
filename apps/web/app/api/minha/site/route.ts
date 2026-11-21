import { erro, json } from '@/lib/api';
import { fonteDeDados } from '@/lib/fonte-dados';
import { minhaLoterica, MinhaIndisponivel } from '@/lib/minha';
import { metricasDoSiteNoPeriodo, salvarSite, sitesConhecidos } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** GET /api/minha/site?loja=&dias=30: configuração e métricas do site público. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const fonte = fonteDeDados();
  try {
    const loja = await minhaLoterica(fonte, s.get('loja'));
    const site = (await sitesConhecidos(fonte)).find((x) => x.loterica.codigoCaixa === loja.codigoCaixa);
    if (!site) return erro('sem site para esta lotérica', 404);
    return json({ site, metricas: await metricasDoSiteNoPeriodo(fonte, site, Number(s.get('dias')) || 30) });
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return erro(e.message, 409);
    throw e;
  }
}

/** POST /api/minha/site?loja= (formulário ou JSON): grava a configuração do site (precisa do banco). */
export async function POST(req: Request) {
  const s = new URL(req.url).searchParams;
  const fonte = fonteDeDados();
  if (fonte.tipo !== 'postgres') return erro('editar o site precisa do banco (DATABASE_URL)', 409);
  try {
    const loja = await minhaLoterica(fonte, s.get('loja'));
    const tipo = req.headers.get('content-type') ?? '';
    const dados = tipo.includes('application/json') ? ((await req.json()) as Record<string, string>) : Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
    const site = await salvarSite(fonte, loja.codigoCaixa, dados);
    if (!tipo.includes('application/json')) return Response.redirect(new URL(`/minha/site?loja=${loja.codigoCaixa}`, req.url), 303);
    return json(site);
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return erro(e.message, 409);
    return erro((e as Error).message, 400);
  }
}
