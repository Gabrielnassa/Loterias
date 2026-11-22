import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarSql, migrar, recriarBancoDeTeste, type Sql } from '@radar/db';
import { somarDias } from '@radar/core';
import { estadoVazio, RepositorioContasMemoria } from '@/lib/contas/memoria';
import { RepositorioContasPostgres } from '@/lib/contas/postgres';
import { montarContexto, type ContextoSessao } from '@/lib/contas/sessao';
import type { RepositorioContas } from '@/lib/contas/tipos';
import { RepositorioGestaoMemoria, RepositorioGestaoPostgres, type RepositorioGestao } from '@/lib/gestao/repositorio';
import {
  caixasDaLoja,
  ErroGestao,
  hojeSP,
  lerValor,
  pagarDespesaFixa,
  pagarFiado,
  painelCaixas,
  painelDre,
  painelFiados,
  painelFinanceiro,
  registrarCarroForte,
  registrarCobranca,
  removerRegistro,
  salvarCaixa,
  salvarDespesaFixa,
  salvarFechamento,
  salvarFiado,
  salvarLancamento,
} from '@/lib/gestao/servico';

async function montar(contas: RepositorioContas) {
  const u = await contas.criarUsuario({ email: `dono${Math.random()}@exemplo.com`, nome: 'Dono' });
  const c = await contas.criarConta('Grupo');
  await contas.salvarLoja({ contaId: c.id, codigo: '2894', nome: 'Loja Centro', franquiaLimite: 8000 });
  await contas.salvarLoja({ contaId: c.id, codigo: '1234', nome: 'Loja Bairro', franquiaLimite: 8000 });
  await contas.salvarMembro({ contaId: c.id, usuarioId: u.id, papel: 'responsavel', telas: null, lojas: null });
  const col = await contas.criarUsuario({ email: `col${Math.random()}@exemplo.com`, nome: 'Caixa' });
  await contas.salvarMembro({ contaId: c.id, usuarioId: col.id, papel: 'colaborador', telas: ['gestao-caixa'], lojas: ['1234'] });
  const dono = (await montarContexto(contas, { usuarioId: u.id, contaId: c.id }))!;
  const colaborador = (await montarContexto(contas, { usuarioId: col.id, contaId: c.id }))!;
  return { dono, colaborador };
}

function suite(nome: string, criar: () => Promise<{ contas: RepositorioContas; gestao: RepositorioGestao }>) {
  describe(`gestão da loja (${nome})`, () => {
    let gestao: RepositorioGestao;
    let dono: ContextoSessao;
    let colaborador: ContextoSessao;
    const hoje = hojeSP();
    const ontem = somarDias(hoje, -1);
    beforeAll(async () => {
      const r = await criar();
      gestao = r.gestao;
      ({ dono, colaborador } = await montar(r.contas));
    });

    it('caixas: 1º acesso cria o TFL 1; fechamento por caixa e dia (refazer substitui); cofre com carro-forte', async () => {
      const [tfl] = await caixasDaLoja(gestao, dono as never, '2894');
      expect(tfl!.dados.nome).toBe('TFL 1');
      const federal = await salvarCaixa(gestao, dono, { loja: '2894', nome: 'Federal', tipo: 'extra' });
      const v = { trocoInicial: 300, entradas: 12_480.5, saidas: 3_210, sangrias: 8_000, suprimentos: 200, eletronico: 950, contado: 1_765.5 };
      expect((await salvarFechamento(gestao, dono, { loja: '2894', dia: ontem, caixaId: tfl!.id, valores: v })).resumo).toEqual({ esperado: 1_770.5, diferenca: -5, situacao: 'falta' });
      await salvarFechamento(gestao, dono, { loja: '2894', dia: ontem, caixaId: tfl!.id, valores: { ...v, contado: 1_770.5 } });
      await salvarFechamento(gestao, dono, { loja: '2894', dia: ontem, caixaId: federal.id, valores: { trocoInicial: 50, entradas: 400, saidas: 0, sangrias: 300, suprimentos: 0, eletronico: 0, contado: 152 } });
      await registrarCarroForte(gestao, dono, { loja: '2894', dia: hoje, tipo: 'recolhimento', valor: 7_500, guia: 'G-77' });
      await expect(salvarFechamento(gestao, dono, { loja: '2894', dia: somarDias(hoje, 1), caixaId: tfl!.id, valores: v })).rejects.toThrow(/futuro/);
      const p = await painelCaixas(gestao, dono, { loja: '2894', dia: ontem });
      expect(p.caixas.filter((c) => c.fechamento)).toHaveLength(2);
      expect(p.totalQuebras30).toBe(2);
      expect(p.cofre.saldo).toBe(8_300 - 200);
      expect((await painelCaixas(gestao, dono, { loja: '2894', dia: hoje })).cofre.saldo).toBe(8_100 - 7_500);
      // caixa com fechamento guardado só é desativado
      expect(await removerRegistro(gestao, dono, 'caixa', federal.id)).toBe('desativado');
    });

    it('colaborador só mexe na loja liberada', async () => {
      await expect(painelCaixas(gestao, colaborador, { loja: '2894' })).resolves.toMatchObject({ loja: '1234' });
      const [tfl] = await caixasDaLoja(gestao, dono as never, '2894');
      await expect(salvarFechamento(gestao, colaborador, { loja: '2894', dia: ontem, caixaId: tfl!.id, valores: { trocoInicial: 0, entradas: 0, saidas: 0, sangrias: 0, suprimentos: 0, eletronico: 0, contado: 0 } })).rejects.toThrow(ErroGestao);
    });

    it('fluxo, despesas fixas e DRE consolidando as 2 lojas', async () => {
      const mes = hoje.slice(0, 7);
      const dia1 = `${mes}-01`;
      await salvarLancamento(gestao, dono, { loja: '2894', dia: somarDias(dia1, -1), dados: { tipo: 'saldo-inicial', categoria: 'saldo', descricao: '', valor: 5_000, forma: 'banco' } });
      await salvarLancamento(gestao, dono, { loja: '2894', dia: dia1, dados: { tipo: 'receita', categoria: 'remuneracao-caixa', descricao: 'Remuneração', valor: 18_000, forma: 'banco' } });
      await salvarLancamento(gestao, dono, { loja: '1234', dia: dia1, dados: { tipo: 'receita', categoria: 'boloes', descricao: 'Tarifas', valor: 2_000, forma: 'banco' } });
      const aluguel = await salvarDespesaFixa(gestao, dono, { loja: '2894', descricao: 'Aluguel', categoria: 'aluguel', valor: 4_000, diaVencimento: 1 });
      await pagarDespesaFixa(gestao, dono, { id: aluguel.id, dia: dia1, forma: 'banco' });
      await expect(salvarLancamento(gestao, dono, { loja: '2894', dia: dia1, dados: { tipo: 'despesa', categoria: 'inventada', descricao: '', valor: 1, forma: 'banco' } })).rejects.toThrow(/categoria/);
      const f = await painelFinanceiro(gestao, dono, {});
      expect(f.lojas.sort()).toEqual(['1234', '2894']);
      expect(f.fluxo.saldoInicial).toBe(5_000);
      expect(f.despesas.find((d) => d.id === aluguel.id)!.paga).toBe(true);
      expect(f.receitaBruta).toBe(20_000);
      const so = await painelFinanceiro(gestao, dono, { loja: '1234' });
      expect(so.receitaBruta).toBe(2_000);
      const dre = await painelDre(gestao, dono, { mes });
      const resultado = dre.linhas.find((l) => l.chave === 'resultado')!;
      // quebras: o fechamento de ontem só entra se ontem for deste mês
      const quebra = ontem.startsWith(mes) ? 2 : 0;
      expect(resultado.porLoja).toEqual({ '2894': 14_000 + quebra, '1234': 2_000 });
    });

    it('fiados: anotar, cobrança do dia, cobrei, pagamento parcial e quitação', async () => {
      const f = await salvarFiado(gestao, dono, { loja: '2894', dia: somarDias(hoje, -10), cliente: 'Maria Souza', telefone: '(11) 98765-4321', descricao: 'Bolão Mega', valor: 300, vencimento: somarDias(hoje, -3) });
      await salvarFiado(gestao, dono, { loja: '1234', dia: hoje, cliente: 'João', descricao: 'Jogo', valor: 50, vencimento: somarDias(hoje, 5) });
      let p = await painelFiados(gestao, dono, {});
      expect(p.totalAberto).toBe(350);
      expect(p.cobranca.map((c) => [c.cliente, c.diasAtraso])).toEqual([['Maria Souza', 3]]);
      expect(p.cobranca[0]!.whatsapp).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=Ol%C3%A1%2C%20Maria/);
      await registrarCobranca(gestao, dono, f.id, hoje);
      p = await painelFiados(gestao, dono, {});
      expect(p.cobranca[0]!.cobradoHoje).toBe(true);
      expect(await pagarFiado(gestao, dono, { id: f.id, dia: hoje, valor: 100, forma: 'pix' })).toEqual({ valor: 100, saldo: 200 });
      expect(await pagarFiado(gestao, dono, { id: f.id, dia: hoje, forma: 'dinheiro' })).toEqual({ valor: 200, saldo: 0 });
      await expect(pagarFiado(gestao, dono, { id: f.id, dia: hoje, forma: 'dinheiro' })).rejects.toThrow(/quitado/);
      p = await painelFiados(gestao, dono, {});
      expect(p.quitados.map((x) => x.dados.cliente)).toEqual(['Maria Souza']);
      expect(p.totalAberto).toBe(50);
      await removerRegistro(gestao, dono, 'fiado', f.id);
      expect((await painelFiados(gestao, dono, {})).quitados).toHaveLength(0);
    });
  });
}

suite('memória', async () => ({ contas: new RepositorioContasMemoria(estadoVazio()), gestao: new RepositorioGestaoMemoria() }));

const URL_TESTE = process.env.DATABASE_URL_TESTE;
if (URL_TESTE) {
  let sql: Sql;
  beforeAll(async () => {
    sql = criarSql(await recriarBancoDeTeste(URL_TESTE, 'radar_teste_gestao'), { max: 4 });
    await migrar(sql, () => {});
  });
  afterAll(async () => {
    await sql?.end();
  });
  suite('postgres', async () => ({ contas: new RepositorioContasPostgres(sql), gestao: new RepositorioGestaoPostgres(sql) }));
}

describe('valores digitados', () => {
  it('aceita 1.234,56 / 1234.56 / R$ 10', () => {
    expect(lerValor('1.234,56')).toBe(1234.56);
    expect(lerValor('1234.56')).toBe(1234.56);
    expect(lerValor('R$ 10')).toBe(10);
    expect(lerValor('')).toBe(0);
    expect(() => lerValor('abc')).toThrow(ErroGestao);
  });
});
