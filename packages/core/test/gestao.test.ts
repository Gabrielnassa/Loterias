import { describe, expect, it } from 'vitest';
import {
  cobrancaDoDia,
  despesasDoMes,
  dreMensal,
  fluxoDeCaixa,
  linkWhatsApp,
  mensagemDeCobranca,
  movimentosDoCofre,
  resumoFechamento,
  saldoDoCofre,
  saldoDoFiado,
  somarMes,
  ultimoDiaDoMes,
  validarFechamento,
  type Fechamento,
  type Fiado,
  type Lancamento,
} from '../gestao/gestao';

const F = (x: Partial<Fechamento>): Fechamento => ({ caixaId: 'tfl1', trocoInicial: 300, entradas: 0, saidas: 0, sangrias: 0, suprimentos: 0, eletronico: 0, contado: 0, ...x });

describe('gestão: fechamento de caixa e cofre', () => {
  it('esperado = troco + entradas − saídas − sangrias + suprimentos; diferença e quebra', () => {
    const f = F({ entradas: 12_480.5, saidas: 3_210, sangrias: 8_000, suprimentos: 200, contado: 1_765.5 });
    expect(resumoFechamento(f)).toEqual({ esperado: 1_770.5, diferenca: -5, situacao: 'falta' });
    expect(resumoFechamento({ ...f, contado: 1_770.8 }).situacao).toBe('ok');
    expect(resumoFechamento({ ...f, contado: 1_775.5 })).toMatchObject({ diferenca: 5, situacao: 'sobra' });
    expect(validarFechamento({ ...f, saidas: -1 })).toMatch(/saidas/);
    expect(validarFechamento(f)).toBeNull();
  });
  it('cofre: + sangrias − suprimentos − recolhimento do carro-forte + entregas', () => {
    const mov = movimentosDoCofre(
      [{ dia: '2026-11-20', loja: '1', dados: F({ sangrias: 8_000, suprimentos: 200 }), caixaNome: 'TFL 1' }, { dia: '2026-11-21', loja: '1', dados: F({ sangrias: 5_000 }) }],
      [{ dia: '2026-11-21', loja: '1', dados: { tipo: 'recolhimento', valor: 12_000, guia: 'A123' } }, { dia: '2026-11-21', loja: '1', dados: { tipo: 'entrega', valor: 1_000 } }],
    );
    expect(saldoDoCofre(mov, '2026-11-20')).toBe(7_800);
    expect(saldoDoCofre(mov)).toBe(1_800);
    expect(mov.find((m) => m.valor === -12_000)!.descricao).toBe('Carro-forte: recolhimento (guia A123)');
  });
});

describe('gestão: fluxo de caixa, despesas fixas e DRE', () => {
  const L = (dia: string, loja: string, dados: Lancamento) => ({ dia, loja, dados });
  const lanc = [
    L('2026-10-31', '1', { tipo: 'saldo-inicial', categoria: 'saldo', descricao: 'saldo', valor: 10_000, forma: 'banco' }),
    L('2026-11-05', '1', { tipo: 'despesa', categoria: 'aluguel', descricao: 'Aluguel', valor: 4_000, forma: 'banco', despesaFixaId: 'alug' }),
    L('2026-11-10', '1', { tipo: 'receita', categoria: 'remuneracao-caixa', descricao: 'Remuneração out', valor: 18_000, forma: 'banco' }),
    L('2026-11-10', '1', { tipo: 'despesa', categoria: 'impostos', descricao: 'Simples', valor: 1_080, forma: 'banco' }),
    L('2026-11-15', '2', { tipo: 'receita', categoria: 'boloes', descricao: 'Tarifas', valor: 3_000, forma: 'banco' }),
    L('2026-11-15', '2', { tipo: 'despesa', categoria: 'pessoal', descricao: 'Folha', valor: 5_000, forma: 'banco' }),
    L('2026-11-16', '2', { tipo: 'despesa', categoria: 'inventada', descricao: 'Algo', valor: 100, forma: 'dinheiro' }),
  ];
  it('fluxo dia a dia com saldo acumulado', () => {
    const f = fluxoDeCaixa(lanc.filter((l) => l.loja === '1'), '2026-11-01', '2026-11-30');
    expect(f.saldoInicial).toBe(10_000);
    expect(f.dias).toEqual([
      { dia: '2026-11-05', entradas: 0, saidas: 4_000, saldo: 6_000 },
      { dia: '2026-11-10', entradas: 18_000, saidas: 1_080, saldo: 22_920 },
    ]);
  });
  it('despesas fixas do mês: paga (com lançamento) ou a pagar/atrasada', () => {
    const fixas = [
      { id: 'alug', loja: '1', dados: { descricao: 'Aluguel', categoria: 'aluguel' as const, valor: 4_000, diaVencimento: 5, ativa: true } },
      { id: 'luz', loja: '1', dados: { descricao: 'Energia', categoria: 'energia-agua' as const, valor: 600, diaVencimento: 31, ativa: true } },
      { id: 'net', loja: '1', dados: { descricao: 'Internet', categoria: 'telefone-internet' as const, valor: 150, diaVencimento: 10, ativa: true } },
    ];
    const d = despesasDoMes(fixas, lanc, '2026-11', '2026-11-20');
    expect(d.map((x) => [x.id, x.vencimento, x.paga, x.atrasada])).toEqual([
      ['alug', '2026-11-05', true, false],
      ['net', '2026-11-10', false, true],
      ['luz', '2026-11-30', false, false],
    ]);
  });
  it('DRE por loja e consolidado, com quebras de caixa e categoria desconhecida em "outras"', () => {
    const fech = [{ dia: '2026-11-12', loja: '1', dados: F({ entradas: 100, contado: 395 }) }]; // falta de 5
    const r = dreMensal({ mes: '2026-11', lojas: ['1', '2'], lancamentos: lanc, fechamentos: fech });
    const v = (k: string) => r.linhas.find((l) => l.chave === k)!;
    expect(v('receita-bruta')).toMatchObject({ porLoja: { '1': 18_000, '2': 3_000 }, total: 21_000 });
    expect(v('receita-liquida').total).toBe(19_920);
    expect(v('despesas-operacionais').porLoja).toEqual({ '1': 4_000, '2': 5_100 });
    expect(v('quebras').porLoja['1']).toBe(-5);
    expect(v('resultado')).toMatchObject({ porLoja: { '1': 12_915, '2': -2_100 }, total: 10_815 });
    expect(r.margem.total).toBe(0.515);
    expect(r.linhas.some((l) => l.chave === 'despesa:seguranca')).toBe(false); // linhas zeradas somem
  });
});

describe('gestão: fiados e cobrança do dia', () => {
  const fi = (id: string, valor: number, vencimento: string, pago = 0, cobrancas: string[] = []) => ({
    id,
    loja: '1',
    dados: { cliente: `Cliente ${id} Silva`, telefone: '(11) 98765-4321', descricao: 'Bolão', valor, vencimento, pagamentos: pago ? [{ dia: '2026-11-18', valor: pago, forma: 'pix' as const }] : [], cobrancas } satisfies Fiado,
  });
  it('em aberto e vencidos primeiro; quem já foi cobrado hoje vai para o fim; quitados somem', () => {
    const lista = cobrancaDoDia([fi('a', 100, '2026-11-20'), fi('b', 300, '2026-11-10', 50), fi('c', 80, '2026-11-25'), fi('d', 90, '2026-11-01', 90), fi('e', 500, '2026-11-15', 0, ['2026-11-20'])], '2026-11-20');
    expect(lista.map((x) => [x.id, x.diasAtraso, x.saldo, x.cobradoHoje])).toEqual([
      ['b', 10, 250, false],
      ['a', 0, 100, false],
      ['e', 5, 500, true],
    ]);
    expect(saldoDoFiado(fi('b', 300, '2026-11-10', 50).dados)).toBe(250);
  });
  it('mensagem e link do WhatsApp', () => {
    const msg = mensagemDeCobranca({ cliente: 'Maria Souza', saldo: 250, vencimento: '2026-11-10', diasAtraso: 10 }, 'Loja Centro');
    expect(msg).toMatch(/^Olá, Maria! Aqui é da Loja Centro\. .*R\$\s?250,00 que venceu em 10\/11\/2026/);
    expect(linkWhatsApp('(11) 98765-4321', 'oi')).toBe('https://wa.me/5511987654321?text=oi');
    expect(linkWhatsApp('123', 'oi')).toBeNull();
  });
  it('meses', () => {
    expect(somarMes('2026-12', 1)).toBe('2027-01');
    expect(somarMes('2026-01', -1)).toBe('2025-12');
    expect(ultimoDiaDoMes('2028-02')).toBe('2028-02-29');
  });
});
