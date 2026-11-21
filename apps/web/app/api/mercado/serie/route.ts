import { erro } from '@/lib/api';
import { COLUNAS_SERIE, responderTabela } from '@/lib/exportar-mercado';
import { fonteDeDados } from '@/lib/fonte-dados';
import { abasDoConcurso, fonteMercado, lerAba, lerFiltro, lerInstante } from '@/lib/mercado';

export const dynamic = 'force-dynamic';

/** GET /api/mercado/serie?concurso=mega-sena-3089&aba=minuto|hora&uf=&em=&formato=: série do Monitoramento. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const fonte = fonteDeDados();
  const chave = s.get('concurso');
  if (!chave) return erro('informe o concurso (ex.: mega-sena-3089)', 400);
  const em = lerInstante(s.get('em')) ?? fonteMercado(fonte).agora();
  const aba = lerAba(s.get('aba'));
  const d = await abasDoConcurso(fonte, chave, { em, aba, filtro: lerFiltro({ uf: s.get('uf') }) });
  if (!d) return erro('concurso não encontrado', 404);
  const linhas = aba === 'hora' || aba === 'paginas' ? d.porHora : d.porMinuto;
  return responderTabela(req, { nome: `serie-${chave}-${aba}`, aba: aba === 'hora' ? 'Hora a hora' : 'Minuto a minuto', colunas: COLUNAS_SERIE, linhas, dados: { concurso: d.concurso, aba, serie: linhas } });
}
