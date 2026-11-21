import { COLUNAS_PANORAMA, responderTabela } from '@/lib/exportar-mercado';
import { fonteDeDados } from '@/lib/fonte-dados';
import { lerFiltro, panoramaLoterias } from '@/lib/mercado';

export const dynamic = 'force-dynamic';

/** GET /api/estatisticas/loterias?uf=&formato=: panorama nacional por loteria. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const d = await panoramaLoterias(fonteDeDados(), { filtro: lerFiltro({ uf: s.get('uf') }) });
  return responderTabela(req, { nome: `loterias-${s.get('uf') || 'BR'}`, aba: 'Loterias', colunas: COLUNAS_PANORAMA, linhas: d.linhas, dados: d });
}
