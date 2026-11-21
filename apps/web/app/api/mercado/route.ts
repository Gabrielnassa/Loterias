import type { Coluna } from '@/lib/exportar';
import { responderTabela } from '@/lib/exportar-mercado';
import { fonteDeDados } from '@/lib/fonte-dados';
import { NOME_MODALIDADE } from '@/lib/formato';
import { lerFiltro, lerInstante, monitoramento } from '@/lib/mercado';

export const dynamic = 'force-dynamic';

type Cartao = Awaited<ReturnType<typeof monitoramento>>['cartoes'][number];
const COLUNAS: Coluna<Cartao>[] = [
  { titulo: 'Loteria', valor: (c) => NOME_MODALIDADE[c.concurso.modalidade] },
  { titulo: 'Concurso', valor: (c) => c.concurso.concurso },
  { titulo: 'Bolões', valor: (c) => c.retrato.boloes },
  { titulo: 'Cotas', valor: (c) => c.retrato.cotas },
  { titulo: 'Lotéricas', valor: (c) => c.retrato.lotericas },
  { titulo: 'R$ à venda', valor: (c) => c.retrato.valor, formato: '#,##0.00' },
  { titulo: 'Páginas', valor: (c) => c.retrato.paginas },
  { titulo: 'Ticket médio', valor: (c) => c.retrato.ticketMedio, formato: '#,##0.00' },
  { titulo: 'Cotas vendidas 5 min', valor: (c) => c.retrato.delta5min.cotasVendidas },
  { titulo: 'Ritmo (cotas/min)', valor: (c) => c.retrato.ritmoPorMinuto },
  { titulo: '% esgotado', valor: (c) => c.retrato.pctEsgotado, formato: '0.0%' },
];

/** GET /api/mercado?uf=SP&em=2026-11-21T20:00&formato=json|csv|xlsx: cartões do Monitoramento MKP. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const m = await monitoramento(fonteDeDados(), { em: lerInstante(s.get('em')), filtro: lerFiltro({ uf: s.get('uf') }) });
  return responderTabela(req, { nome: `monitoramento-${s.get('uf') || 'BR'}`, aba: 'Monitoramento', colunas: COLUNAS, linhas: m.cartoes, dados: m });
}
