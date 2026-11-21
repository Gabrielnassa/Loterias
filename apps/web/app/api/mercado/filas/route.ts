import { erro } from '@/lib/api';
import { COLUNAS_FILA, responderTabela } from '@/lib/exportar-mercado';
import { fonteDeDados } from '@/lib/fonte-dados';
import { filasDoConcurso, fonteMercado, lerFiltro, lerInstante } from '@/lib/mercado';

export const dynamic = 'force-dynamic';

/** GET /api/mercado/filas?concurso=lotofacil-3840&uf=SP&cidade=&em=&formato=: tabela por fila. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const fonte = fonteDeDados();
  const chave = s.get('concurso') ?? (await fonteMercado(fonte).concursosAVenda(fonteMercado(fonte).agora()))[0]?.chave;
  if (!chave) return erro('nenhum concurso à venda', 404);
  const d = await filasDoConcurso(fonte, chave, { em: lerInstante(s.get('em')), filtro: lerFiltro({ uf: s.get('uf'), cidade: s.get('cidade') }) });
  if (!d) return erro('concurso não encontrado', 404);
  return responderTabela(req, { nome: `filas-${chave}-${s.get('uf') || 'BR'}`, aba: 'Filas', colunas: COLUNAS_FILA, linhas: d.resumo.porFila, dados: d });
}
