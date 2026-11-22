import { arquivo, json, TIPO_CSV, TIPO_XLSX } from '@/lib/api';
import { AVISO_ESTIMATIVA, paraCsv, paraXlsx, type Coluna } from '@/lib/exportar';
import { fonteDeDados } from '@/lib/fonte-dados';
import { lerFiltro, listasElite } from '@/lib/mercado';

export const dynamic = 'force-dynamic';

type Linha = Awaited<ReturnType<typeof listasElite>>['top'][number];

const COLUNAS: Coluna<Linha>[] = [
  { titulo: 'Código', valor: (l) => l.loterica.codigoCaixa },
  { titulo: 'Lotérica', valor: (l) => l.loterica.nome, largura: 30 },
  { titulo: 'Cidade', valor: (l) => l.loterica.cidade },
  { titulo: 'UF', valor: (l) => l.loterica.uf },
  { titulo: 'Noites (de 7)', valor: (l) => l.presencas },
  { titulo: 'Noites por franquia (*)', valor: (l) => l.noites.filter((n) => n.porFranquia).length },
  { titulo: 'Franquia média que resta (R$)', valor: (l) => l.franquiaMediaRestante, formato: '#,##0.00' },
  { titulo: 'Limite estimado (R$)', valor: (l) => l.limiteEstimado, formato: '#,##0.00' },
  { titulo: 'Fila média por modalidade', valor: (l) => Object.entries(l.filaMedia).map(([m, v]) => `${m} ${v}`).join('; '), largura: 40 },
];

/** GET /api/raio-x/elite?lista=elite|top&uf=SP&cidade=&formato=json|csv|xlsx */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const r = await listasElite(fonteDeDados(), { filtro: lerFiltro({ uf: s.get('uf'), cidade: s.get('cidade') }) });
  const lista = s.get('lista') === 'top' ? 'top' : 'elite';
  const linhas = lista === 'top' ? r.top : r.elite;
  const nome = `${lista}-${s.get('uf') || 'BR'}`;
  if (s.get('formato') === 'csv') return arquivo(paraCsv(COLUNAS, linhas), `${nome}.csv`, TIPO_CSV);
  if (s.get('formato') === 'xlsx') return arquivo(await paraXlsx(lista === 'top' ? 'Top' : 'Elite', COLUNAS, linhas, AVISO_ESTIMATIVA), `${nome}.xlsx`, TIPO_XLSX);
  return json({ ...r, lista });
}
