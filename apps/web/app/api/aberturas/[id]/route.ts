import { arquivo, erro, json, TIPO_CSV, TIPO_XLSX } from '@/lib/api';
import { fonteDeDados } from '@/lib/fonte-dados';
import { AVISO_ESTIMATIVA, paraCsv, paraXlsx, type Coluna } from '@/lib/exportar';
import { fmtHora } from '@/lib/formato';
import { detalheAbertura } from '@/lib/servico';

export const dynamic = 'force-dynamic';

type Linha = NonNullable<Awaited<ReturnType<typeof detalheAbertura>>>['linhas'][number];

const COLUNAS: Coluna<Linha>[] = [
  { titulo: 'Entrada (hora)', valor: (l) => fmtHora(l.entradaEm) },
  { titulo: 'Atraso (s)', valor: (l) => Math.round(l.atrasoS) },
  { titulo: 'Código lotérica', valor: (l) => l.loterica.codigoCaixa },
  { titulo: 'Lotérica', valor: (l) => l.loterica.nome, largura: 30 },
  { titulo: 'Cidade', valor: (l) => l.loterica.cidade },
  { titulo: 'UF', valor: (l) => l.loterica.uf },
  { titulo: 'Formato', valor: (l) => l.formato },
  { titulo: 'Fila', valor: (l) => l.fila },
  { titulo: 'Cotas', valor: (l) => l.cotasTotal },
  { titulo: 'Cotas vendidas', valor: (l) => l.cotasVendidas },
  { titulo: 'Valor da cota (R$)', valor: (l) => l.valorCota, formato: '#,##0.00' },
  { titulo: 'Valor do bolão (R$)', valor: (l) => l.valorTotal, formato: '#,##0.00' },
  { titulo: 'Posição cidade', valor: (l) => l.colocacao.cidade.posicao },
  { titulo: 'Posição UF', valor: (l) => l.colocacao.uf.posicao },
  { titulo: 'Página UF', valor: (l) => l.colocacao.uf.pagina },
  { titulo: 'Posição Brasil', valor: (l) => l.colocacao.brasil.posicao },
  { titulo: 'Situação', valor: (l) => l.situacao },
  { titulo: 'Empate na leitura', valor: (l) => (l.empate ? 'sim' : 'não') },
];

/** GET /api/aberturas/{id}?uf=SP&formato=json|csv|xlsx — tela 2 (todos os bolões da janela). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = new URL(req.url).searchParams;
  const uf = s.get('uf') || undefined;
  const d = await detalheAbertura(fonteDeDados(), id, uf ? { uf } : {});
  if (!d) return erro(`abertura ${id} não encontrada`, 404);
  const formato = s.get('formato');
  if (formato === 'csv') return arquivo(paraCsv(COLUNAS, d.linhas), `abertura-${id}.csv`, TIPO_CSV);
  if (formato === 'xlsx') return arquivo(await paraXlsx('Abertura', COLUNAS, d.linhas, AVISO_ESTIMATIVA), `abertura-${id}.xlsx`, TIPO_XLSX);
  return json(d);
}
