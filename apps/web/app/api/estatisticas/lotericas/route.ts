import type { Coluna } from '@/lib/exportar';
import { responderTabela } from '@/lib/exportar-mercado';
import { fonteDeDados } from '@/lib/fonte-dados';
import { lerFiltro, topDoPeriodo } from '@/lib/mercado';

export const dynamic = 'force-dynamic';

type Linha = Awaited<ReturnType<typeof topDoPeriodo>>['linhas'][number];
const COLUNAS: Coluna<Linha>[] = [
  { titulo: 'Código', valor: (l) => l.loterica.codigoCaixa },
  { titulo: 'Lotérica', valor: (l) => l.loterica.nome, largura: 30 },
  { titulo: 'Cidade', valor: (l) => l.loterica.cidade },
  { titulo: 'UF', valor: (l) => l.loterica.uf },
  { titulo: 'Bolões', valor: (l) => l.boloes },
  { titulo: 'R$ inserido', valor: (l) => l.valor, formato: '#,##0.00' },
  { titulo: 'R$ vendido', valor: (l) => l.vendido, formato: '#,##0.00' },
];

/** GET /api/estatisticas/lotericas?criterio=valor|vendido|boloes&dias=30&uf=&formato=: Top 10. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const criterio = s.get('criterio') === 'vendido' || s.get('criterio') === 'boloes' ? (s.get('criterio') as 'vendido' | 'boloes') : 'valor';
  const dias = [7, 30, 90].includes(Number(s.get('dias'))) ? Number(s.get('dias')) : 30;
  const d = await topDoPeriodo(fonteDeDados(), { dias, criterio, filtro: lerFiltro({ uf: s.get('uf') }) });
  return responderTabela(req, { nome: `top-lotericas-${criterio}`, aba: 'Top 10', colunas: COLUNAS, linhas: d.linhas, dados: d });
}
