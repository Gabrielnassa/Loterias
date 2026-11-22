import { centavos } from '../util/estatistica';

/**
 * Gestão da loja física (Fase 6): caixas por TFL e extras, fechamento diário, cofre e carro-forte,
 * fluxo de caixa, despesas, fiados com a cobrança do dia e DRE mensal, por loja e consolidado.
 *
 * Duas contas de dinheiro que NÃO se misturam:
 * - numerário (cofre): o dinheiro que passa pelos caixas, quase todo da CAIXA (arrecadação). Controle:
 *   sangrias e suprimentos dos caixas, recolhimentos e entregas do carro-forte, quebras de caixa;
 * - fluxo de caixa e DRE: só o dinheiro DA LOTÉRICA (remuneração da CAIXA, tarifas de bolão, outras
 *   receitas, despesas). As quebras de caixa entram no DRE porque a lotérica cobre as faltas.
 */
export type TipoCaixa = 'tfl' | 'extra';

export interface Caixa {
  nome: string;
  tipo: TipoCaixa;
  ativo: boolean;
  ordem: number;
}

export interface Fechamento {
  caixaId: string;
  operador?: string | null;
  trocoInicial: number;
  /** Entradas em dinheiro do dia (relatório do TFL / do caixa extra). */
  entradas: number;
  /** Saídas em dinheiro (prêmios, saques, pagamentos). */
  saidas: number;
  /** Retiradas para o cofre durante o dia e no fechamento. */
  sangrias: number;
  /** Reforços de troco vindos do cofre. */
  suprimentos: number;
  /** Recebido em cartão/Pix (informativo: não fica na gaveta). */
  eletronico: number;
  /** Dinheiro contado na gaveta no fechamento. */
  contado: number;
  observacao?: string | null;
}

export const TOLERANCIA_QUEBRA = 0.5;

export interface ResumoFechamento {
  esperado: number;
  diferenca: number;
  situacao: 'ok' | 'falta' | 'sobra';
}

/** Dinheiro esperado na gaveta = troco + entradas - saídas - sangrias + suprimentos; diferença = contado - esperado. */
export function resumoFechamento(f: Fechamento): ResumoFechamento {
  const esperado = centavos(f.trocoInicial + f.entradas - f.saidas - f.sangrias + f.suprimentos);
  const diferenca = centavos(f.contado - esperado);
  return { esperado, diferenca, situacao: Math.abs(diferenca) <= TOLERANCIA_QUEBRA ? 'ok' : diferenca < 0 ? 'falta' : 'sobra' };
}

export function validarFechamento(f: Fechamento): string | null {
  for (const k of ['trocoInicial', 'entradas', 'saidas', 'sangrias', 'suprimentos', 'eletronico', 'contado'] as const) {
    if (!Number.isFinite(f[k]) || f[k] < 0) return `valor inválido em ${k}`;
    if (f[k] > 10_000_000) return `valor alto demais em ${k}`;
  }
  return null;
}

// ------------------------------------------------------------------ cofre e carro-forte

export interface CarroForte {
  /** recolhimento: sai do cofre (vai para a CAIXA/banco); entrega: numerário que chega ao cofre. */
  tipo: 'recolhimento' | 'entrega';
  valor: number;
  guia?: string | null;
  observacao?: string | null;
}

export interface MovimentoCofre {
  dia: string;
  loja: string;
  descricao: string;
  valor: number;
}

/** Movimentos do cofre: + sangrias, − suprimentos, − recolhimentos, + entregas. */
export function movimentosDoCofre(
  fechamentos: readonly { dia: string; loja: string; dados: Fechamento; caixaNome?: string }[],
  carroForte: readonly { dia: string; loja: string; dados: CarroForte }[],
): MovimentoCofre[] {
  const out: MovimentoCofre[] = [];
  for (const f of fechamentos) {
    if (f.dados.sangrias) out.push({ dia: f.dia, loja: f.loja, descricao: `Sangrias ${f.caixaNome ?? 'caixa'}`, valor: f.dados.sangrias });
    if (f.dados.suprimentos) out.push({ dia: f.dia, loja: f.loja, descricao: `Suprimento ${f.caixaNome ?? 'caixa'}`, valor: -f.dados.suprimentos });
  }
  for (const c of carroForte) {
    out.push({ dia: c.dia, loja: c.loja, descricao: c.dados.tipo === 'recolhimento' ? `Carro-forte: recolhimento${c.dados.guia ? ` (guia ${c.dados.guia})` : ''}` : `Carro-forte: entrega${c.dados.guia ? ` (guia ${c.dados.guia})` : ''}`, valor: c.dados.tipo === 'recolhimento' ? -c.dados.valor : c.dados.valor });
  }
  return out.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
}

export function saldoDoCofre(movimentos: readonly MovimentoCofre[], ate?: string): number {
  return centavos(movimentos.filter((m) => !ate || m.dia <= ate).reduce((s, m) => s + m.valor, 0));
}

// ------------------------------------------------------------------ fluxo de caixa e despesas

export const CATEGORIAS_RECEITA = [
  ['remuneracao-caixa', 'Remuneração da CAIXA (comissões e tarifas de serviços)'],
  ['boloes', 'Tarifas de bolão'],
  ['federal', 'Loteria Federal (margem)'],
  ['outras-receitas', 'Outras receitas'],
] as const;

export const CATEGORIAS_DESPESA = [
  ['impostos', 'Impostos (Simples, ISS...)'],
  ['pessoal', 'Pessoal (salários, encargos, benefícios)'],
  ['aluguel', 'Aluguel e condomínio'],
  ['energia-agua', 'Energia e água'],
  ['telefone-internet', 'Telefone e internet'],
  ['seguranca', 'Segurança (vigilância, alarme, seguro)'],
  ['carro-forte', 'Carro-forte (tarifa do serviço)'],
  ['material', 'Material e suprimentos'],
  ['manutencao', 'Manutenção'],
  ['contabilidade', 'Contabilidade'],
  ['tarifas-bancarias', 'Tarifas bancárias'],
  ['pro-labore', 'Pró-labore'],
  ['outras-despesas', 'Outras despesas'],
] as const;

export type CategoriaReceita = (typeof CATEGORIAS_RECEITA)[number][0];
export type CategoriaDespesa = (typeof CATEGORIAS_DESPESA)[number][0];

export interface Lancamento {
  tipo: 'receita' | 'despesa' | 'saldo-inicial';
  categoria: string;
  descricao: string;
  valor: number;
  forma: 'dinheiro' | 'banco';
  /** Despesa fixa que este lançamento pagou (no mês). */
  despesaFixaId?: string | null;
}

export interface DespesaFixa {
  descricao: string;
  categoria: CategoriaDespesa;
  valor: number;
  diaVencimento: number;
  ativa: boolean;
}

export const nomeCategoria = (c: string) => [...CATEGORIAS_RECEITA, ...CATEGORIAS_DESPESA].find(([k]) => k === c)?.[1] ?? c;

export interface DiaDoFluxo {
  dia: string;
  entradas: number;
  saidas: number;
  saldo: number;
}

/** Fluxo de caixa da lotérica (dinheiro dela), dia a dia: saldo acumulado desde o saldo inicial. */
export function fluxoDeCaixa(lancamentos: readonly { dia: string; dados: Lancamento }[], de: string, ate: string): { saldoInicial: number; dias: DiaDoFluxo[]; saldoFinal: number } {
  const sinal = (l: Lancamento) => (l.tipo === 'despesa' ? -l.valor : l.valor);
  const antes = lancamentos.filter((l) => l.dia < de).reduce((s, l) => s + sinal(l.dados), 0);
  const porDia = new Map<string, { entradas: number; saidas: number }>();
  for (const l of lancamentos) {
    if (l.dia < de || l.dia > ate) continue;
    const d = porDia.get(l.dia) ?? { entradas: 0, saidas: 0 };
    if (l.dados.tipo === 'despesa') d.saidas += l.dados.valor;
    else d.entradas += l.dados.valor;
    porDia.set(l.dia, d);
  }
  let saldo = antes;
  const dias = [...porDia.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dia, d]) => {
      saldo += d.entradas - d.saidas;
      return { dia, entradas: centavos(d.entradas), saidas: centavos(d.saidas), saldo: centavos(saldo) };
    });
  return { saldoInicial: centavos(antes), dias, saldoFinal: centavos(saldo) };
}

/** Despesas fixas do mês: pagas (com lançamento ligado) ou a pagar, com o vencimento. */
export function despesasDoMes(
  fixas: readonly { id: string; loja: string; dados: DespesaFixa }[],
  lancamentos: readonly { dia: string; loja: string; dados: Lancamento }[],
  mes: string,
  hoje: string,
): { id: string; loja: string; descricao: string; categoria: string; valor: number; vencimento: string; paga: boolean; atrasada: boolean }[] {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return fixas
    .filter((f) => f.dados.ativa)
    .map((f) => {
      const vencimento = `${mes}-${String(Math.min(f.dados.diaVencimento, ultimo)).padStart(2, '0')}`;
      const paga = lancamentos.some((l) => l.dados.despesaFixaId === f.id && l.dia.startsWith(mes));
      return { id: f.id, loja: f.loja, descricao: f.dados.descricao, categoria: f.dados.categoria, valor: f.dados.valor, vencimento, paga, atrasada: !paga && vencimento < hoje };
    })
    .sort((x, y) => (x.vencimento < y.vencimento ? -1 : 1));
}

// ------------------------------------------------------------------ fiados e cobrança do dia

export interface Fiado {
  cliente: string;
  telefone?: string | null;
  descricao: string;
  valor: number;
  /** AAAA-MM-DD */
  vencimento: string;
  pagamentos: { dia: string; valor: number; forma: 'dinheiro' | 'pix' | 'cartao' }[];
  /** Dias em que a loja cobrou (WhatsApp, telefone, balcão). */
  cobrancas: string[];
}

export function saldoDoFiado(f: Fiado): number {
  return centavos(Math.max(0, f.valor - f.pagamentos.reduce((s, p) => s + p.valor, 0)));
}

export interface ItemCobranca {
  id: string;
  loja: string;
  cliente: string;
  telefone: string | null;
  saldo: number;
  vencimento: string;
  diasAtraso: number;
  cobradoHoje: boolean;
  ultimaCobranca: string | null;
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Cobrança do dia: fiados em aberto que vencem até hoje, os mais atrasados e maiores primeiro. */
export function cobrancaDoDia(fiados: readonly { id: string; loja: string; dados: Fiado }[], hoje: string): ItemCobranca[] {
  return fiados
    .map((f) => ({ f, saldo: saldoDoFiado(f.dados) }))
    .filter(({ f, saldo }) => saldo > 0 && f.dados.vencimento <= hoje)
    .map(({ f, saldo }) => {
      const ultima = [...f.dados.cobrancas].sort().at(-1) ?? null;
      return { id: f.id, loja: f.loja, cliente: f.dados.cliente, telefone: f.dados.telefone ?? null, saldo, vencimento: f.dados.vencimento, diasAtraso: diasEntre(f.dados.vencimento, hoje), cobradoHoje: ultima === hoje, ultimaCobranca: ultima };
    })
    .sort((a, b) => Number(a.cobradoHoje) - Number(b.cobradoHoje) || b.diasAtraso - a.diasAtraso || b.saldo - a.saldo);
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function mensagemDeCobranca(i: Pick<ItemCobranca, 'cliente' | 'saldo' | 'vencimento' | 'diasAtraso'>, loja: string): string {
  const quando = i.diasAtraso > 0 ? `venceu em ${i.vencimento.split('-').reverse().join('/')}` : 'vence hoje';
  return `Olá, ${i.cliente.split(' ')[0]}! Aqui é da ${loja}. Passando para lembrar do valor de ${moeda.format(i.saldo)} que ${quando}. Pode pagar no balcão ou por Pix. Obrigado!`;
}

/** Link do WhatsApp com a mensagem pronta (telefone brasileiro: DDI 55 se faltar). */
export function linkWhatsApp(telefone: string | null | undefined, texto: string): string | null {
  const d = (telefone ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  const numero = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

// ------------------------------------------------------------------ DRE mensal (por loja e consolidado)

export interface LinhaDre {
  chave: string;
  nome: string;
  nivel: 'grupo' | 'item' | 'total';
  porLoja: Record<string, number>;
  total: number;
}

/**
 * DRE do mês: receita bruta (por categoria) − impostos = receita líquida − despesas operacionais
 * (por categoria) + quebras de caixa (sobras − faltas) = resultado; margem sobre a receita bruta.
 */
export function dreMensal(o: {
  mes: string;
  lojas: readonly string[];
  lancamentos: readonly { dia: string; loja: string; dados: Lancamento }[];
  fechamentos: readonly { dia: string; loja: string; dados: Fechamento }[];
}): { linhas: LinhaDre[]; margem: Record<string, number | null> } {
  const doMes = o.lancamentos.filter((l) => l.dia.startsWith(o.mes) && l.dados.tipo !== 'saldo-inicial');
  const vazio = () => Object.fromEntries(o.lojas.map((l) => [l, 0])) as Record<string, number>;
  const soma = (filtro: (l: Lancamento) => boolean) => {
    const r = vazio();
    for (const l of doMes) if (filtro(l.dados) && l.loja in r) r[l.loja] = centavos(r[l.loja]! + l.dados.valor);
    return r;
  };
  const linha = (chave: string, nome: string, nivel: LinhaDre['nivel'], porLoja: Record<string, number>): LinhaDre => ({ chave, nome, nivel, porLoja, total: centavos(Object.values(porLoja).reduce((s, v) => s + v, 0)) });
  const combinar = (f: (l: string) => number) => Object.fromEntries(o.lojas.map((l) => [l, centavos(f(l))])) as Record<string, number>;

  const receitas = CATEGORIAS_RECEITA.map(([k, n]) => linha(`receita:${k}`, n, 'item', soma((l) => l.tipo === 'receita' && l.categoria === k)));
  const outrasCatReceita = soma((l) => l.tipo === 'receita' && !CATEGORIAS_RECEITA.some(([k]) => k === l.categoria));
  receitas[receitas.length - 1] = linha('receita:outras-receitas', CATEGORIAS_RECEITA.at(-1)![1], 'item', combinar((l) => receitas.at(-1)!.porLoja[l]! + outrasCatReceita[l]!));
  const bruta = linha('receita-bruta', 'Receita bruta', 'grupo', combinar((l) => receitas.reduce((s, r) => s + r.porLoja[l]!, 0)));
  const impostos = linha('impostos', '(−) Impostos', 'item', soma((l) => l.tipo === 'despesa' && l.categoria === 'impostos'));
  const liquida = linha('receita-liquida', 'Receita líquida', 'total', combinar((l) => bruta.porLoja[l]! - impostos.porLoja[l]!));
  const despesas = CATEGORIAS_DESPESA.filter(([k]) => k !== 'impostos').map(([k, n]) => linha(`despesa:${k}`, n, 'item', soma((l) => l.tipo === 'despesa' && l.categoria === k)));
  const semCategoria = soma((l) => l.tipo === 'despesa' && !CATEGORIAS_DESPESA.some(([k]) => k === l.categoria));
  const iOutras = despesas.findIndex((d) => d.chave === 'despesa:outras-despesas');
  despesas[iOutras] = linha('despesa:outras-despesas', 'Outras despesas', 'item', combinar((l) => despesas[iOutras]!.porLoja[l]! + semCategoria[l]!));
  const operacionais = linha('despesas-operacionais', '(−) Despesas operacionais', 'grupo', combinar((l) => despesas.reduce((s, d) => s + d.porLoja[l]!, 0)));
  const quebras = vazio();
  for (const f of o.fechamentos) if (f.dia.startsWith(o.mes) && f.loja in quebras) quebras[f.loja] = centavos(quebras[f.loja]! + resumoFechamento(f.dados).diferenca);
  const linhaQuebras = linha('quebras', '(±) Quebras de caixa (sobras − faltas)', 'item', quebras);
  const resultado = linha('resultado', 'Resultado do mês', 'total', combinar((l) => liquida.porLoja[l]! - operacionais.porLoja[l]! + quebras[l]!));
  const margem: Record<string, number | null> = Object.fromEntries([...o.lojas, 'total'].map((l) => {
    const b = l === 'total' ? bruta.total : bruta.porLoja[l]!;
    const r = l === 'total' ? resultado.total : resultado.porLoja[l]!;
    return [l, b ? Math.round((r / b) * 1000) / 1000 : null];
  }));
  return { linhas: [bruta, ...receitas, impostos, liquida, operacionais, ...despesas.filter((d) => d.total !== 0), linhaQuebras, resultado], margem };
}

/** Mês AAAA-MM anterior / seguinte. */
export function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function ultimoDiaDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
}
