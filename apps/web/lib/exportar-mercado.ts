import type { LinhaFila, LinhaPanorama, PontoSerie } from '@radar/core';
import { arquivo, json, TIPO_CSV, TIPO_XLSX } from './api';
import { AVISO_ESTIMATIVA, paraCsv, paraXlsx, type Coluna } from './exportar';
import { NOME_MODALIDADE } from './formato';

const R = '#,##0.00';
const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const COLUNAS_SERIE: Coluna<PontoSerie>[] = [
  { titulo: 'Até (SP)', valor: (p) => hora.format(p.t), largura: 16 },
  { titulo: 'Bolões à venda', valor: (p) => p.boloes },
  { titulo: 'Cotas à venda', valor: (p) => p.cotas },
  { titulo: 'R$ à venda', valor: (p) => p.valor, formato: R },
  { titulo: 'Páginas', valor: (p) => p.paginas },
  { titulo: 'Novos', valor: (p) => p.novos },
  { titulo: 'Cotas vendidas', valor: (p) => p.cotasVendidas },
  { titulo: 'R$ vendido', valor: (p) => p.valorVendido, formato: R },
  { titulo: 'Esgotados', valor: (p) => p.esgotados },
];

export const COLUNAS_FILA: Coluna<LinhaFila>[] = [
  { titulo: 'Fila', valor: (f) => f.fila },
  { titulo: 'Bolões', valor: (f) => f.boloes },
  { titulo: 'À venda', valor: (f) => f.aVenda },
  { titulo: 'R$ à venda', valor: (f) => f.valorAVenda, formato: R },
  { titulo: '% vendido', valor: (f) => f.pctVendido, formato: '0.0%' },
  { titulo: 'Página de', valor: (f) => f.paginaDe },
  { titulo: 'Página até', valor: (f) => f.paginaAte },
  { titulo: 'Cota média', valor: (f) => f.cotaMedia, formato: R },
  { titulo: 'Bolão médio', valor: (f) => f.bolaoMedio, formato: R },
  { titulo: 'Formato mais colocado', valor: (f) => f.formatoMaisColocado, largura: 18 },
  { titulo: 'Formato que mais vende', valor: (f) => f.formatoQueMaisVende?.formato ?? '', largura: 18 },
];

export const COLUNAS_PANORAMA: Coluna<LinhaPanorama>[] = [
  { titulo: 'Loteria', valor: (l) => (l.modalidade === 'total' ? 'Total' : NOME_MODALIDADE[l.modalidade]) },
  { titulo: 'Concurso', valor: (l) => l.concurso },
  { titulo: 'Bolões à venda', valor: (l) => l.boloes },
  { titulo: 'Cotas à venda', valor: (l) => l.cotas },
  { titulo: 'Total inserido (R$)', valor: (l) => l.valorInserido, formato: R },
  { titulo: 'Ainda à venda (R$)', valor: (l) => l.valorAVenda, formato: R },
  { titulo: 'Lotéricas', valor: (l) => l.lotericas },
  { titulo: 'Esgotados', valor: (l) => l.esgotados },
];

/** JSON, CSV ou Excel conforme `formato`. */
export async function responderTabela<T>(req: Request, o: { nome: string; aba: string; colunas: Coluna<T>[]; linhas: T[]; dados: unknown }): Promise<Response> {
  const formato = new URL(req.url).searchParams.get('formato');
  if (formato === 'csv') return arquivo(paraCsv(o.colunas, o.linhas), `${o.nome}.csv`, TIPO_CSV);
  if (formato === 'xlsx') return arquivo(await paraXlsx(o.aba, o.colunas, o.linhas, AVISO_ESTIMATIVA), `${o.nome}.xlsx`, TIPO_XLSX);
  return json(o.dados);
}
