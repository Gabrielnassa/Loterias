import { erro } from '@/lib/api';
import { COLUNAS_FILA, responderTabela } from '@/lib/exportar-mercado';
import { fonteDeDados } from '@/lib/fonte-dados';
import { lerFiltro, painelMegaDaVirada } from '@/lib/mercado';

export const dynamic = 'force-dynamic';

/** GET /api/mega-da-virada?uf=&formato=: painel do concurso especial (filas em CSV/Excel). */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const p = await painelMegaDaVirada(fonteDeDados(), { filtro: lerFiltro({ uf: s.get('uf') }) });
  if (!p) return erro('nenhum concurso especial à venda', 404);
  return responderTabela(req, { nome: `mega-da-virada-${p.concurso.concurso}`, aba: 'Filas', colunas: COLUNAS_FILA, linhas: p.filas.porFila, dados: p });
}
