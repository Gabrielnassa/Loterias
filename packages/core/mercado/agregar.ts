import { centavos } from '../util/estatistica';

/** Agregados de mercado por UF (+ total 'BR') a partir de uma leitura: base de mercado_minuto. */
export interface ItemMercado {
  loterica: { codigoCaixa: string; uf: string };
  cotasDisponiveis: number;
  valorCotaBase: number;
}

export interface LinhaMercado {
  uf: string;
  boloes: number;
  cotasDisponiveis: number;
  lotericas: number;
  /** R$ ainda à venda (valor base, sem tarifa). */
  valorAVenda: number;
}

export function agregarMercado(itens: readonly ItemMercado[]): LinhaMercado[] {
  const acc = new Map<string, { boloes: number; cotas: number; lot: Set<string>; valor: number }>();
  const somar = (uf: string, it: ItemMercado) => {
    let a = acc.get(uf);
    if (!a) acc.set(uf, (a = { boloes: 0, cotas: 0, lot: new Set(), valor: 0 }));
    a.boloes++;
    a.cotas += it.cotasDisponiveis;
    a.lot.add(it.loterica.codigoCaixa);
    a.valor += it.cotasDisponiveis * it.valorCotaBase;
  };
  for (const it of itens) {
    if (it.cotasDisponiveis <= 0) continue;
    somar('BR', it);
    somar(it.loterica.uf, it);
  }
  return [...acc.entries()]
    .map(([uf, a]) => ({ uf, boloes: a.boloes, cotasDisponiveis: a.cotas, lotericas: a.lot.size, valorAVenda: centavos(a.valor) }))
    .sort((a, b) => (a.uf === 'BR' ? -1 : b.uf === 'BR' ? 1 : a.uf.localeCompare(b.uf)));
}

/** Trunca para o minuto (chave de mercado_minuto). */
export function minutoDe(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 60_000) * 60_000);
}
