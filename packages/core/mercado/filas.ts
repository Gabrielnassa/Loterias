import { BOLOES_POR_PAGINA } from '../dominio/constantes';
import type { LotericaRef } from '../dominio/tipos';
import { diaSP } from '../tempo/fuso';
import { centavos } from '../util/estatistica';
import { disponiveisEm, faixaDePreco, FAIXAS_PRECO, formatoDe, naRegiao, valorTotal, type BolaoMercado, type FiltroRegiao } from './vitrine';

/**
 * Filas MKP: a vitrine mostra a 1ª fila inteira (o 1º bolão de cada lotérica), depois a 2ª, e assim
 * por diante. Por fila: quantos bolões, quanto ainda está à venda, % vendido, em que páginas ela
 * está agora, cota e bolão médios, o formato mais colocado e o que mais vende.
 */
export interface LinhaFila {
  fila: number;
  boloes: number;
  aVenda: number;
  valorAVenda: number;
  pctVendido: number;
  /** Páginas que a fila ocupa agora (null se nenhum bolão dela está à venda). */
  paginaDe: number | null;
  paginaAte: number | null;
  cotaMedia: number;
  bolaoMedio: number;
  formatoMaisColocado: string;
  /** Formato com maior % vendido entre os que têm ao menos 3 bolões na fila. */
  formatoQueMaisVende: { formato: string; pctVendido: number; boloes: number } | null;
}

export interface FaixaPrecoVenda {
  faixa: string;
  boloes: number;
  pctVendido: number | null;
  /** Fração que sobra (1 − % vendido) dividida pela da faixa mais barata com dados: "sobra 1,9x mais". */
  sobraRelativa: number | null;
}

export interface BolaoRanking {
  id: string;
  loterica: LotericaRef;
  formato: string;
  fila: number;
  valorTotal: number;
  valorCotaBase: number;
  cotasTotal: number;
  disponiveis: number;
  pctVendido: number;
  entrouEm: Date;
}

export interface ResumoFilasMercado {
  em: Date;
  boloes: number;
  esgotados: number;
  lotericas: number;
  paginas: number;
  filas: number;
  valorVendido: number;
  valorAVenda: number;
  maiorBolao: BolaoRanking | null;
  novosPorDia: { dia: string; novos: number }[];
  porFila: LinhaFila[];
  porFaixaDePreco: FaixaPrecoVenda[];
  maiores: BolaoRanking[];
}

function maisFrequente(xs: string[]): string {
  const c = new Map<string, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
}

export function resumoFilasMercado(
  boloes: readonly BolaoMercado[],
  em: Date | number,
  o: { filtro?: FiltroRegiao; fechaEm?: Date | number | null; maiores?: number } = {},
): ResumoFilasMercado {
  const t = typeof em === 'number' ? em : em.getTime();
  const fecha = o.fechaEm === undefined || o.fechaEm === null ? Infinity : typeof o.fechaEm === 'number' ? o.fechaEm : o.fechaEm.getTime();
  const tv = Math.min(t, fecha);
  const aberto = t < fecha;
  const inseridos: { b: BolaoMercado; d: number }[] = [];
  for (const b of boloes) {
    if (!naRegiao(b.loterica, o.filtro)) continue;
    const d = disponiveisEm(b, tv);
    if (d !== null) inseridos.push({ b, d });
  }
  // ordem da vitrine: (fila, entrada); só os que estão à venda ocupam página
  const visiveis = aberto ? inseridos.filter((x) => x.d > 0).sort((x, y) => x.b.fila - y.b.fila || x.b.entrouEm - y.b.entrouEm || x.b.id.localeCompare(y.b.id)) : [];
  const paginaDe = new Map<number, [number, number]>();
  visiveis.forEach((x, i) => {
    const p = Math.ceil((i + 1) / BOLOES_POR_PAGINA);
    const atual = paginaDe.get(x.b.fila);
    paginaDe.set(x.b.fila, atual ? [atual[0], p] : [p, p]);
  });

  const ranking = (x: { b: BolaoMercado; d: number }): BolaoRanking => ({
    id: x.b.id,
    loterica: x.b.loterica,
    formato: formatoDe(x.b),
    fila: x.b.fila,
    valorTotal: valorTotal(x.b),
    valorCotaBase: x.b.valorCotaBase,
    cotasTotal: x.b.cotasTotal,
    disponiveis: x.d,
    pctVendido: (x.b.cotasTotal - x.d) / x.b.cotasTotal,
    entrouEm: new Date(x.b.entrouEm),
  });

  const porFilaMap = new Map<number, { b: BolaoMercado; d: number }[]>();
  for (const x of inseridos) porFilaMap.set(x.b.fila, [...(porFilaMap.get(x.b.fila) ?? []), x]);
  const porFila: LinhaFila[] = [...porFilaMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([fila, xs]) => {
      const cotas = xs.reduce((s, x) => s + x.b.cotasTotal, 0);
      const vendidas = xs.reduce((s, x) => s + x.b.cotasTotal - x.d, 0);
      const porFormato = new Map<string, { n: number; cotas: number; vend: number }>();
      for (const x of xs) {
        const f = formatoDe(x.b);
        const a = porFormato.get(f) ?? { n: 0, cotas: 0, vend: 0 };
        a.n++;
        a.cotas += x.b.cotasTotal;
        a.vend += x.b.cotasTotal - x.d;
        porFormato.set(f, a);
      }
      const melhor = [...porFormato.entries()]
        .filter(([, a]) => a.n >= 3)
        .map(([formato, a]) => ({ formato, pctVendido: a.vend / a.cotas, boloes: a.n }))
        .sort((a, b) => b.pctVendido - a.pctVendido || b.boloes - a.boloes)[0];
      const vis = xs.filter((x) => x.d > 0 && aberto);
      const pag = paginaDe.get(fila);
      return {
        fila,
        boloes: xs.length,
        aVenda: vis.length,
        valorAVenda: centavos(vis.reduce((s, x) => s + x.d * x.b.valorCotaBase, 0)),
        pctVendido: cotas ? vendidas / cotas : 0,
        paginaDe: pag?.[0] ?? null,
        paginaAte: pag?.[1] ?? null,
        cotaMedia: centavos(xs.reduce((s, x) => s + x.b.valorCotaBase, 0) / xs.length),
        bolaoMedio: centavos(xs.reduce((s, x) => s + valorTotal(x.b), 0) / xs.length),
        formatoMaisColocado: maisFrequente(xs.map((x) => formatoDe(x.b))),
        formatoQueMaisVende: melhor ?? null,
      };
    });

  const porFaixa = FAIXAS_PRECO.map(([faixa]) => {
    const xs = inseridos.filter((x) => faixaDePreco(x.b.valorCotaBase) === faixa);
    const cotas = xs.reduce((s, x) => s + x.b.cotasTotal, 0);
    const vend = xs.reduce((s, x) => s + x.b.cotasTotal - x.d, 0);
    return { faixa, boloes: xs.length, pctVendido: cotas ? vend / cotas : null };
  });
  const base = porFaixa.find((f) => f.pctVendido !== null && f.pctVendido < 1);
  const porFaixaDePreco = porFaixa.map((f) => ({
    ...f,
    sobraRelativa: f.pctVendido === null || !base || base.pctVendido === null ? null : Math.round(((1 - f.pctVendido) / (1 - base.pctVendido)) * 100) / 100,
  }));

  const novos = new Map<string, number>();
  for (const x of inseridos) {
    const dia = diaSP(new Date(x.b.entrouEm));
    novos.set(dia, (novos.get(dia) ?? 0) + 1);
  }
  const maiores = [...inseridos].sort((a, b) => valorTotal(b.b) - valorTotal(a.b) || a.b.entrouEm - b.b.entrouEm).slice(0, o.maiores ?? 20).map(ranking);
  return {
    em: new Date(t),
    boloes: inseridos.length,
    esgotados: inseridos.filter((x) => x.d === 0).length,
    lotericas: new Set(inseridos.map((x) => x.b.loterica.codigoCaixa)).size,
    paginas: Math.ceil(visiveis.length / BOLOES_POR_PAGINA),
    filas: visiveis.reduce((m, x) => Math.max(m, x.b.fila), 0),
    valorVendido: centavos(inseridos.reduce((s, x) => s + (x.b.cotasTotal - x.d) * x.b.valorCotaBase, 0)),
    valorAVenda: centavos(visiveis.reduce((s, x) => s + x.d * x.b.valorCotaBase, 0)),
    maiorBolao: maiores[0] ?? null,
    novosPorDia: [...novos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, n]) => ({ dia, novos: n })),
    porFila,
    porFaixaDePreco,
    maiores,
  };
}
