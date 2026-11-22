import {
  CATEGORIAS_DESPESA,
  CATEGORIAS_RECEITA,
  centavos,
  cobrancaDoDia,
  despesasDoMes,
  diaSP,
  dreMensal,
  fluxoDeCaixa,
  linkWhatsApp,
  mensagemDeCobranca,
  movimentosDoCofre,
  resumoFechamento,
  saldoDoCofre,
  saldoDoFiado,
  somarDias,
  ultimoDiaDoMes,
  validarFechamento,
  type Caixa,
  type Fechamento,
  type Fiado,
  type Lancamento,
} from '@radar/core';
import type { ContextoSessao } from '@/lib/contas/sessao';
import type { RepositorioGestao } from './repositorio';

/**
 * Gestão da loja física: validação, lojas que a pessoa pode ver e os painéis de cada tela.
 * As regras (fechamento, cofre, fluxo, DRE, cobrança) estão em core/gestao/gestao.ts.
 */
export class ErroGestao extends Error {}

type Ctx = ContextoSessao & { conta: { id: string; nome: string } };

export function exigirConta(ctx: ContextoSessao | null): asserts ctx is Ctx {
  if (!ctx?.conta) throw new ErroGestao('entre numa conta primeiro');
}

/** A loja precisa ser da conta e estar liberada para a pessoa (colaborador pode ter só algumas). */
export function lojaPermitida(ctx: Ctx, loja: string): string {
  if (!ctx.lojas.some((l) => l.codigo === loja)) throw new ErroGestao('lotérica fora da sua conta ou não liberada para você');
  return loja;
}

/** "1.234,56", "1234.56" ou "1234,5" -> número (vazio = 0). */
export function lerValor(v: string | null | undefined): number {
  const s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  if (!Number.isFinite(n)) throw new ErroGestao(`valor inválido: ${v}`);
  return centavos(n);
}

const dataValida = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`));
export function lerDia(d: string | null | undefined, padrao: string): string {
  return d && dataValida(d) ? d : padrao;
}
export const hojeSP = () => diaSP(new Date());

// ------------------------------------------------------------------ caixas, fechamento, cofre

export async function caixasDaLoja(repo: RepositorioGestao, ctx: Ctx, loja: string) {
  let caixas = await repo.listar(ctx.conta.id, 'caixa', { lojas: [loja] });
  if (!caixas.length) {
    // 1ª visita: um TFL para começar (a pessoa renomeia e acrescenta os outros)
    await repo.salvar({ contaId: ctx.conta.id, loja, tipo: 'caixa', dia: null, dados: { nome: 'TFL 1', tipo: 'tfl', ativo: true, ordem: 1 }, criadoPor: ctx.usuario.id });
    caixas = await repo.listar(ctx.conta.id, 'caixa', { lojas: [loja] });
  }
  return caixas.sort((a, b) => a.dados.ordem - b.dados.ordem || a.dados.nome.localeCompare(b.dados.nome));
}

export async function salvarCaixa(repo: RepositorioGestao, ctx: ContextoSessao | null, d: { id?: string; loja: string; nome: string; tipo: string; ativo?: boolean }) {
  exigirConta(ctx);
  const loja = lojaPermitida(ctx, d.loja);
  const nome = d.nome.trim();
  if (nome.length < 2 || nome.length > 40) throw new ErroGestao('nome do caixa: 2 a 40 letras');
  const existentes = await repo.listar(ctx.conta.id, 'caixa', { lojas: [loja] });
  const atual = d.id ? existentes.find((c) => c.id === d.id) : undefined;
  const dados: Caixa = { nome, tipo: d.tipo === 'extra' ? 'extra' : 'tfl', ativo: d.ativo ?? true, ordem: atual?.dados.ordem ?? existentes.length + 1 };
  return repo.salvar({ ...(atual ? { id: atual.id } : {}), contaId: ctx.conta.id, loja, tipo: 'caixa', dia: null, dados, criadoPor: ctx.usuario.id });
}

export async function salvarFechamento(repo: RepositorioGestao, ctx: ContextoSessao | null, d: { loja: string; dia: string; caixaId: string; valores: Omit<Fechamento, 'caixaId'> }) {
  exigirConta(ctx);
  const loja = lojaPermitida(ctx, d.loja);
  if (!dataValida(d.dia) || d.dia > hojeSP()) throw new ErroGestao('dia inválido (não dá para fechar um dia futuro)');
  const caixa = await repo.obter(ctx.conta.id, 'caixa', d.caixaId);
  if (!caixa || caixa.loja !== loja) throw new ErroGestao('caixa não encontrado nesta lotérica');
  const dados: Fechamento = { caixaId: d.caixaId, ...d.valores };
  const p = validarFechamento(dados);
  if (p) throw new ErroGestao(p);
  const r = await repo.salvar({ contaId: ctx.conta.id, loja, tipo: 'fechamento', dia: d.dia, chave: `fechamento:${d.caixaId}:${d.dia}`, dados, criadoPor: ctx.usuario.id });
  return { registro: r, resumo: resumoFechamento(dados), caixa: caixa.dados.nome };
}

export async function registrarCarroForte(repo: RepositorioGestao, ctx: ContextoSessao | null, d: { loja: string; dia: string; tipo: string; valor: number; guia?: string | null }) {
  exigirConta(ctx);
  const loja = lojaPermitida(ctx, d.loja);
  if (!dataValida(d.dia)) throw new ErroGestao('dia inválido');
  if (!(d.valor > 0)) throw new ErroGestao('informe o valor');
  return repo.salvar({ contaId: ctx.conta.id, loja, tipo: 'carro-forte', dia: d.dia, dados: { tipo: d.tipo === 'entrega' ? 'entrega' : 'recolhimento', valor: d.valor, guia: d.guia?.trim() || null }, criadoPor: ctx.usuario.id });
}

export async function painelCaixas(repo: RepositorioGestao, ctx: ContextoSessao | null, o: { loja?: string | null; dia?: string | null }) {
  exigirConta(ctx);
  if (!ctx.lojas.length) throw new ErroGestao('a conta não tem lotérica liberada para você');
  const loja = lojaPermitida(ctx, o.loja && ctx.lojas.some((l) => l.codigo === o.loja) ? o.loja : ctx.lojas[0]!.codigo);
  const hoje = hojeSP();
  const dia = lerDia(o.dia, hoje);
  const desde = somarDias(dia, -29);
  const [caixas, fechamentos, carro] = await Promise.all([
    caixasDaLoja(repo, ctx, loja),
    repo.listar(ctx.conta.id, 'fechamento', { lojas: [loja], de: desde, ate: dia }),
    repo.listar(ctx.conta.id, 'carro-forte', { lojas: [loja] }),
  ]);
  const nomeCaixa = new Map(caixas.map((c) => [c.id, c.dados.nome]));
  // o saldo do cofre usa TODOS os fechamentos e movimentos até o dia
  const todosFech = await repo.listar(ctx.conta.id, 'fechamento', { lojas: [loja], ate: dia });
  const mov = movimentosDoCofre(
    todosFech.map((f) => ({ dia: f.dia!, loja, dados: f.dados, caixaNome: nomeCaixa.get(f.dados.caixaId) ?? 'caixa' })),
    carro.filter((c) => c.dia! <= dia).map((c) => ({ dia: c.dia!, loja, dados: c.dados })),
  );
  const doDia = new Map(fechamentos.filter((f) => f.dia === dia).map((f) => [f.dados.caixaId, f]));
  const quebras = new Map<string, number>();
  for (const f of fechamentos) quebras.set(f.dia!, centavos((quebras.get(f.dia!) ?? 0) + resumoFechamento(f.dados).diferenca));
  return {
    loja,
    dia,
    hoje,
    caixas: caixas.map((c) => {
      const f = doDia.get(c.id);
      return { ...c, fechamento: f ?? null, resumo: f ? resumoFechamento(f.dados) : null };
    }),
    quebras30: [...quebras.entries()].sort(([a], [b]) => (a < b ? 1 : -1)),
    totalQuebras30: centavos([...quebras.values()].reduce((s, v) => s + v, 0)),
    cofre: { saldo: saldoDoCofre(mov, dia), movimentos: mov.filter((m) => m.dia >= desde).reverse() },
    carroForte: carro.filter((c) => c.dia! >= desde).reverse(),
  };
}

// ------------------------------------------------------------------ fluxo de caixa, despesas, DRE

const CATEGORIAS = new Set<string>([...CATEGORIAS_RECEITA.map(([k]) => k), ...CATEGORIAS_DESPESA.map(([k]) => k), 'saldo']);

export async function salvarLancamento(repo: RepositorioGestao, ctx: ContextoSessao | null, d: { id?: string; loja: string; dia: string; dados: Lancamento }) {
  exigirConta(ctx);
  const loja = lojaPermitida(ctx, d.loja);
  if (!dataValida(d.dia)) throw new ErroGestao('dia inválido');
  if (!(d.dados.valor > 0)) throw new ErroGestao('informe o valor');
  if (!['receita', 'despesa', 'saldo-inicial'].includes(d.dados.tipo)) throw new ErroGestao('tipo inválido');
  if (!CATEGORIAS.has(d.dados.categoria)) throw new ErroGestao('categoria inválida');
  const descricao = d.dados.descricao.trim().slice(0, 120) || (d.dados.tipo === 'saldo-inicial' ? 'Saldo inicial' : d.dados.categoria);
  return repo.salvar({ ...(d.id ? { id: d.id } : {}), contaId: ctx.conta.id, loja, tipo: 'lancamento', dia: d.dia, dados: { ...d.dados, descricao, forma: d.dados.forma === 'dinheiro' ? 'dinheiro' : 'banco' }, criadoPor: ctx.usuario.id });
}

export async function salvarDespesaFixa(repo: RepositorioGestao, ctx: ContextoSessao | null, d: { loja: string; descricao: string; categoria: string; valor: number; diaVencimento: number }) {
  exigirConta(ctx);
  const loja = lojaPermitida(ctx, d.loja);
  if (!CATEGORIAS_DESPESA.some(([k]) => k === d.categoria)) throw new ErroGestao('categoria inválida');
  if (!(d.valor > 0)) throw new ErroGestao('informe o valor');
  if (!(d.diaVencimento >= 1 && d.diaVencimento <= 31)) throw new ErroGestao('dia do vencimento: 1 a 31');
  return repo.salvar({ contaId: ctx.conta.id, loja, tipo: 'despesa-fixa', dia: null, dados: { descricao: d.descricao.trim().slice(0, 80) || 'Despesa', categoria: d.categoria as (typeof CATEGORIAS_DESPESA)[number][0], valor: d.valor, diaVencimento: Math.round(d.diaVencimento), ativa: true }, criadoPor: ctx.usuario.id });
}

export async function pagarDespesaFixa(repo: RepositorioGestao, ctx: ContextoSessao | null, d: { id: string; dia: string; valor?: number | null; forma: string }) {
  exigirConta(ctx);
  const f = await repo.obter(ctx.conta.id, 'despesa-fixa', d.id);
  if (!f) throw new ErroGestao('despesa não encontrada');
  return salvarLancamento(repo, ctx, { loja: f.loja, dia: d.dia, dados: { tipo: 'despesa', categoria: f.dados.categoria, descricao: f.dados.descricao, valor: d.valor || f.dados.valor, forma: d.forma === 'dinheiro' ? 'dinheiro' : 'banco', despesaFixaId: f.id } });
}

/** Remove um registro (lançamento, carro-forte, despesa fixa, fiado, caixa) de uma loja liberada. */
export async function removerRegistro(repo: RepositorioGestao, ctx: ContextoSessao | null, tipo: 'lancamento' | 'carro-forte' | 'despesa-fixa' | 'fiado' | 'caixa', id: string) {
  exigirConta(ctx);
  const r = await repo.obter(ctx.conta.id, tipo, id);
  if (!r) throw new ErroGestao('registro não encontrado');
  lojaPermitida(ctx, r.loja);
  if (tipo === 'caixa' && (await repo.listar(ctx.conta.id, 'fechamento', { lojas: [r.loja] })).some((f) => f.dados.caixaId === id)) {
    await repo.salvar({ id, contaId: ctx.conta.id, loja: r.loja, tipo: 'caixa', dia: null, dados: { ...(r.dados as Caixa), ativo: false }, criadoPor: ctx.usuario.id });
    return 'desativado';
  }
  await repo.remover(ctx.conta.id, id);
  return 'removido';
}

/** Lojas escolhidas: uma, ou todas as liberadas ("todas" consolida). */
export function lojasEscolhidas(ctx: Ctx, loja: string | null | undefined): string[] {
  const todas = ctx.lojas.map((l) => l.codigo);
  return loja && todas.includes(loja) ? [loja] : todas;
}

export async function painelFinanceiro(repo: RepositorioGestao, ctx: ContextoSessao | null, o: { loja?: string | null; mes?: string | null }) {
  exigirConta(ctx);
  const lojas = lojasEscolhidas(ctx, o.loja);
  const hoje = hojeSP();
  const mes = o.mes && /^\d{4}-\d{2}$/.test(o.mes) ? o.mes : hoje.slice(0, 7);
  const de = `${mes}-01`;
  const ate = ultimoDiaDoMes(mes);
  const [lancamentos, fixas, fechamentos] = await Promise.all([
    repo.listar(ctx.conta.id, 'lancamento', { lojas, ate }),
    repo.listar(ctx.conta.id, 'despesa-fixa', { lojas }),
    repo.listar(ctx.conta.id, 'fechamento', { lojas, de, ate }),
  ]);
  const comDia = lancamentos.map((l) => ({ id: l.id, dia: l.dia!, loja: l.loja, dados: l.dados }));
  const fluxo = fluxoDeCaixa(comDia, de, ate);
  const dre = dreMensal({ mes, lojas, lancamentos: comDia, fechamentos: fechamentos.map((f) => ({ dia: f.dia!, loja: f.loja, dados: f.dados })) });
  const despesas = despesasDoMes(fixas.map((f) => ({ id: f.id, loja: f.loja, dados: f.dados })), comDia, mes, hoje);
  return {
    lojas,
    mes,
    hoje,
    fluxo,
    lancamentosDoMes: comDia.filter((l) => l.dia >= de).reverse(),
    despesas,
    fixas,
    resultado: dre.linhas.find((l) => l.chave === 'resultado')!.total,
    receitaBruta: dre.linhas.find((l) => l.chave === 'receita-bruta')!.total,
    despesasTotal: centavos(dre.linhas.filter((l) => l.chave === 'impostos' || l.chave === 'despesas-operacionais').reduce((s, l) => s + l.total, 0)),
  };
}

export async function painelDre(repo: RepositorioGestao, ctx: ContextoSessao | null, o: { mes?: string | null }) {
  exigirConta(ctx);
  const lojas = ctx.lojas.map((l) => l.codigo);
  const mes = o.mes && /^\d{4}-\d{2}$/.test(o.mes) ? o.mes : hojeSP().slice(0, 7);
  const [lancamentos, fechamentos] = await Promise.all([
    repo.listar(ctx.conta.id, 'lancamento', { lojas, de: `${mes}-01`, ate: ultimoDiaDoMes(mes) }),
    repo.listar(ctx.conta.id, 'fechamento', { lojas, de: `${mes}-01`, ate: ultimoDiaDoMes(mes) }),
  ]);
  return {
    mes,
    lojas: ctx.lojas,
    ...dreMensal({ mes, lojas, lancamentos: lancamentos.map((l) => ({ dia: l.dia!, loja: l.loja, dados: l.dados })), fechamentos: fechamentos.map((f) => ({ dia: f.dia!, loja: f.loja, dados: f.dados })) }),
  };
}

// ------------------------------------------------------------------ fiados

export async function salvarFiado(repo: RepositorioGestao, ctx: ContextoSessao | null, d: { loja: string; dia: string; cliente: string; telefone?: string | null; descricao: string; valor: number; vencimento: string }) {
  exigirConta(ctx);
  const loja = lojaPermitida(ctx, d.loja);
  const cliente = d.cliente.trim().slice(0, 60);
  if (cliente.length < 2) throw new ErroGestao('informe o nome do cliente');
  if (!(d.valor > 0)) throw new ErroGestao('informe o valor');
  if (!dataValida(d.dia) || !dataValida(d.vencimento)) throw new ErroGestao('datas inválidas');
  const tel = (d.telefone ?? '').replace(/\D/g, '');
  const dados: Fiado = { cliente, telefone: tel.length >= 10 ? tel : null, descricao: d.descricao.trim().slice(0, 120) || 'Fiado', valor: d.valor, vencimento: d.vencimento, pagamentos: [], cobrancas: [] };
  return repo.salvar({ contaId: ctx.conta.id, loja, tipo: 'fiado', dia: d.dia, dados, criadoPor: ctx.usuario.id });
}

export async function pagarFiado(repo: RepositorioGestao, ctx: ContextoSessao | null, d: { id: string; dia: string; valor?: number | null; forma: string }) {
  exigirConta(ctx);
  const f = await repo.obter(ctx.conta.id, 'fiado', d.id);
  if (!f) throw new ErroGestao('fiado não encontrado');
  lojaPermitida(ctx, f.loja);
  const saldo = saldoDoFiado(f.dados);
  if (saldo <= 0) throw new ErroGestao('este fiado já está quitado');
  const valor = d.valor && d.valor > 0 ? Math.min(d.valor, saldo) : saldo;
  const forma = d.forma === 'pix' || d.forma === 'cartao' ? d.forma : 'dinheiro';
  await repo.salvar({ id: f.id, contaId: ctx.conta.id, loja: f.loja, tipo: 'fiado', dia: f.dia, dados: { ...f.dados, pagamentos: [...f.dados.pagamentos, { dia: d.dia, valor, forma }] }, criadoPor: f.criadoPor });
  return { valor, saldo: centavos(saldo - valor) };
}

export async function registrarCobranca(repo: RepositorioGestao, ctx: ContextoSessao | null, id: string, dia: string) {
  exigirConta(ctx);
  const f = await repo.obter(ctx.conta.id, 'fiado', id);
  if (!f) throw new ErroGestao('fiado não encontrado');
  lojaPermitida(ctx, f.loja);
  if (!f.dados.cobrancas.includes(dia)) await repo.salvar({ id: f.id, contaId: ctx.conta.id, loja: f.loja, tipo: 'fiado', dia: f.dia, dados: { ...f.dados, cobrancas: [...f.dados.cobrancas, dia] }, criadoPor: f.criadoPor });
}

export async function painelFiados(repo: RepositorioGestao, ctx: ContextoSessao | null, o: { loja?: string | null }) {
  exigirConta(ctx);
  const lojas = lojasEscolhidas(ctx, o.loja);
  const hoje = hojeSP();
  const todos = await repo.listar(ctx.conta.id, 'fiado', { lojas });
  const nomeLoja = new Map(ctx.lojas.map((l) => [l.codigo, l.nome]));
  const abertos = todos.filter((f) => saldoDoFiado(f.dados) > 0).map((f) => ({ ...f, saldo: saldoDoFiado(f.dados) }));
  const cobranca = cobrancaDoDia(abertos.map((f) => ({ id: f.id, loja: f.loja, dados: f.dados })), hoje).map((i) => {
    const mensagem = mensagemDeCobranca(i, nomeLoja.get(i.loja) ?? 'lotérica');
    return { ...i, mensagem, whatsapp: linkWhatsApp(i.telefone, mensagem) };
  });
  const quitados = todos
    .filter((f) => saldoDoFiado(f.dados) <= 0)
    .map((f) => ({ ...f, quitadoEm: [...f.dados.pagamentos].sort((a, b) => (a.dia < b.dia ? 1 : -1))[0]?.dia ?? f.dia }))
    .filter((f) => f.quitadoEm! >= somarDias(hoje, -30));
  return {
    lojas,
    hoje,
    abertos: abertos.sort((a, b) => (a.dados.vencimento < b.dados.vencimento ? -1 : 1)),
    totalAberto: centavos(abertos.reduce((s, f) => s + f.saldo, 0)),
    cobranca,
    quitados,
  };
}
