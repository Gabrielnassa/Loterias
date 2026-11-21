import { arquivo, json, TIPO_CSV, TIPO_XLSX } from '@/lib/api';
import { fonteDeDados } from '@/lib/dados';
import { AVISO_ESTIMATIVA, paraCsv, paraXlsx, type Coluna } from '@/lib/exportar';
import { lerCriterio, lerEscopo, lerModalidade, lerSemanas, rankingPeriodo } from '@/lib/servico';

export const dynamic = 'force-dynamic';

type Linha = Awaited<ReturnType<typeof rankingPeriodo>>['linhas'][number];

const COLUNAS: Coluna<Linha>[] = [
  { titulo: 'Posição', valor: (l) => l.posicao },
  { titulo: 'Código', valor: (l) => l.loterica.codigoCaixa },
  { titulo: 'Lotérica', valor: (l) => l.loterica.nome, largura: 30 },
  { titulo: 'Cidade', valor: (l) => l.loterica.cidade },
  { titulo: 'UF', valor: (l) => l.loterica.uf },
  { titulo: 'Aberturas', valor: (l) => l.participacoes },
  { titulo: 'Aberturas ocorridas', valor: (l) => l.aberturasOcorridas },
  { titulo: 'Taxa', valor: (l) => l.taxa, formato: '0.0%' },
  { titulo: 'Atraso mediano (s)', valor: (l) => (l.atrasoMedianoS === null ? null : Math.round(l.atrasoMedianoS)) },
  { titulo: 'Melhor colocação', valor: (l) => l.melhorPosicao },
  { titulo: 'Colocação mediana', valor: (l) => l.posicaoMediana },
  { titulo: '% na pág. 1', valor: (l) => l.pctPagina1, formato: '0.0%' },
];

/** GET /api/ranking?uf=SP&cidade=&semanas=4&modalidade=todas&escopo=uf&criterio=mais_aberturas&formato=json|csv|xlsx */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const r = await rankingPeriodo(fonteDeDados(), {
    ...(s.get('uf') ? { uf: s.get('uf')! } : {}),
    ...(s.get('cidade') ? { cidade: s.get('cidade')! } : {}),
    semanas: lerSemanas(s.get('semanas'), 4, 13),
    modalidade: lerModalidade(s.get('modalidade')),
    escopo: lerEscopo(s.get('escopo')),
    criterio: lerCriterio(s.get('criterio')),
  });
  const nome = `ranking-${s.get('uf') || 'BR'}-${r.criterio}`;
  if (s.get('formato') === 'csv') return arquivo(paraCsv(COLUNAS, r.linhas), `${nome}.csv`, TIPO_CSV);
  if (s.get('formato') === 'xlsx') return arquivo(await paraXlsx('Ranking', COLUNAS, r.linhas, AVISO_ESTIMATIVA), `${nome}.xlsx`, TIPO_XLSX);
  return json(r);
}
