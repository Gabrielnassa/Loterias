import { arquivo, TIPO_CSV } from '@/lib/api';
import { contexto } from '@/lib/contexto';
import { paraCsv, type Coluna } from '@/lib/exportar';
import { repositorioGestao } from '@/lib/gestao/ativo';
import { ErroGestao, painelDre } from '@/lib/gestao/servico';

export const dynamic = 'force-dynamic';

/** GET /api/gestao/dre?mes=AAAA-MM&formato=json|csv: DRE do mês por loja e consolidado. */
export async function GET(req: Request) {
  const repo = repositorioGestao();
  if (!repo) return Response.json({ erro: 'contas desligadas' }, { status: 409 });
  const s = new URL(req.url).searchParams;
  try {
    const d = await painelDre(repo, await contexto(), { mes: s.get('mes') });
    if (s.get('formato') === 'csv') {
      type L = (typeof d.linhas)[number];
      const colunas: Coluna<L>[] = [{ titulo: 'Linha', valor: (l) => l.nome }, ...d.lojas.map((j) => ({ titulo: j.nome, valor: (l: L) => l.porLoja[j.codigo] ?? 0 })), { titulo: 'Total', valor: (l) => l.total }];
      return arquivo(paraCsv(colunas, d.linhas), `dre-${d.mes}.csv`, TIPO_CSV);
    }
    return Response.json(d);
  } catch (e) {
    if (e instanceof ErroGestao) return Response.json({ erro: e.message }, { status: 400 });
    throw e;
  }
}

