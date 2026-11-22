import { centavos, diaSP, somarDias, type Fechamento } from '@radar/core';
import { lerEstadoGestao, RepositorioGestaoMemoria, type Registro, type RepositorioGestao } from '@/lib/gestao/repositorio';
import { repositorioDemo } from './contas';

/**
 * Substitui apps/web/lib/gestao/ativo.ts na demonstração: a gestão da loja em memória, guardada no
 * localStorage. Começa com 2 meses de exemplo FICTÍCIOS nas duas lojas da conta de demonstração:
 * caixas (2 TFL + Federal), fechamentos com pequenas quebras, carro-forte, receitas, despesas fixas e fiados.
 */
const CHAVE = 'radar-demo-gestao-v1';
let repo: RepositorioGestaoMemoria | null = null;

function salvar(r: Registro[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(r));
  } catch {
    // sem localStorage: segue em memória
  }
}

function aleatorio(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function semear(r: RepositorioGestaoMemoria, contaId: string, usuarioId: string, lojas: string[]) {
  const hoje = diaSP(new Date());
  const rnd = aleatorio(20261122);
  const base = { contaId, criadoPor: usuarioId };
  for (const [i, loja] of lojas.entries()) {
    const escala = i === 0 ? 1 : 0.6;
    const caixas = [];
    for (const [ordem, [nome, tipo]] of ([['TFL 1', 'tfl'], ['TFL 2', 'tfl'], ['Federal', 'extra']] as const).entries()) {
      caixas.push(await r.salvar({ ...base, loja, tipo: 'caixa', dia: null, dados: { nome, tipo, ativo: true, ordem: ordem + 1 } }));
    }
    // 12 dias de fechamento (sem o de hoje, para a pessoa fechar); o carro-forte recolhe o cofre a cada 2 dias
    let noCofre = 0;
    for (let d = 12; d >= 1; d--) {
      const dia = somarDias(hoje, -d);
      for (const c of caixas) {
        const extra = c.dados.tipo === 'extra';
        const entradas = centavos((extra ? 380 + rnd() * 260 : 9_000 + rnd() * 7_000) * escala);
        const saidas = centavos(extra ? 0 : (2_000 + rnd() * 2_500) * escala);
        const troco = extra ? 50 : 300;
        const sangrias = centavos(Math.max(0, Math.floor((troco + entradas - saidas - troco) / 100) * 100));
        const quebra = rnd() < 0.18 ? centavos((rnd() < 0.7 ? -1 : 1) * (1 + Math.floor(rnd() * 20))) : 0;
        const esperado = troco + entradas - saidas - sangrias;
        const dados: Fechamento = { caixaId: c.id, operador: extra ? 'Ana' : c.dados.nome === 'TFL 1' ? 'Bruno' : 'Carla', trocoInicial: troco, entradas, saidas, sangrias, suprimentos: 0, eletronico: centavos(entradas * 0.12), contado: centavos(esperado + quebra) };
        await r.salvar({ ...base, loja, tipo: 'fechamento', dia, chave: `fechamento:${c.id}:${dia}`, dados });
        noCofre += sangrias;
      }
      if (d % 2 === 0) {
        const valor = Math.floor((noCofre * 0.95) / 100) * 100;
        noCofre -= valor;
        await r.salvar({ ...base, loja, tipo: 'carro-forte', dia, dados: { tipo: 'recolhimento', valor, guia: `G${(1000 + d * 7 + i).toString()}` } });
      }
    }
    // dinheiro da lotérica: saldo inicial, remuneração da CAIXA, tarifas de bolão e despesas fixas
    const mesAtual = hoje.slice(0, 7);
    const mesPassado = somarDias(`${mesAtual}-01`, -1).slice(0, 7);
    await r.salvar({ ...base, loja, tipo: 'lancamento', dia: somarDias(`${mesPassado}-01`, -1), dados: { tipo: 'saldo-inicial', categoria: 'saldo', descricao: 'Saldo inicial', valor: centavos(15_000 * escala), forma: 'banco' } });
    const fixas = [];
    for (const [descricao, categoria, valor, dia] of [
      ['Aluguel', 'aluguel', 5_200, 5],
      ['Folha de pagamento', 'pessoal', 9_800, 5],
      ['Energia', 'energia-agua', 640, 12],
      ['Internet e telefone', 'telefone-internet', 260, 15],
      ['Vigilância e alarme', 'seguranca', 780, 10],
      ['Carro-forte (tarifa)', 'carro-forte', 1_150, 20],
      ['Contabilidade', 'contabilidade', 690, 10],
    ] as const) {
      fixas.push(await r.salvar({ ...base, loja, tipo: 'despesa-fixa', dia: null, dados: { descricao, categoria, valor: centavos(valor * escala), diaVencimento: dia, ativa: true } }));
    }
    for (const mes of [mesPassado, mesAtual]) {
      const dentro = (dia: number) => `${mes}-${String(dia).padStart(2, '0')}` <= hoje;
      if (dentro(8)) await r.salvar({ ...base, loja, tipo: 'lancamento', dia: `${mes}-08`, dados: { tipo: 'receita', categoria: 'remuneracao-caixa', descricao: 'Remuneração CAIXA do mês anterior', valor: centavos((21_000 + rnd() * 3_000) * escala), forma: 'banco' } });
      if (dentro(3)) await r.salvar({ ...base, loja, tipo: 'lancamento', dia: `${mes}-03`, dados: { tipo: 'receita', categoria: 'boloes', descricao: 'Tarifas de bolão (MKP)', valor: centavos((4_200 + rnd() * 900) * escala), forma: 'banco' } });
      if (dentro(20)) await r.salvar({ ...base, loja, tipo: 'lancamento', dia: `${mes}-20`, dados: { tipo: 'receita', categoria: 'federal', descricao: 'Margem da Federal', valor: centavos((520 + rnd() * 200) * escala), forma: 'dinheiro' } });
      if (dentro(20)) await r.salvar({ ...base, loja, tipo: 'lancamento', dia: `${mes}-20`, dados: { tipo: 'despesa', categoria: 'impostos', descricao: 'Simples Nacional', valor: centavos(1_650 * escala), forma: 'banco' } });
      for (const f of fixas) {
        const dia = `${mes}-${String(f.dados.diaVencimento).padStart(2, '0')}`;
        // no mês atual, deixa a internet e o carro-forte a pagar
        if (dia <= hoje && !(mes === mesAtual && (f.dados.categoria === 'telefone-internet' || f.dados.categoria === 'carro-forte'))) {
          await r.salvar({ ...base, loja, tipo: 'lancamento', dia, dados: { tipo: 'despesa', categoria: f.dados.categoria, descricao: f.dados.descricao, valor: f.dados.valor, forma: 'banco', despesaFixaId: f.id } });
        }
      }
    }
  }
  // fiados (clientes fictícios, telefone de exemplo)
  const loja = lojas[0]!;
  const fiado = (cliente: string, valor: number, diasAtras: number, venceEm: number, pagos: number[] = []) =>
    r.salvar({ ...base, loja, tipo: 'fiado', dia: somarDias(hoje, -diasAtras), dados: { cliente, telefone: '11900000000', descricao: 'Bolão', valor, vencimento: somarDias(hoje, venceEm), pagamentos: pagos.map((v, k) => ({ dia: somarDias(hoje, -k - 1), valor: v, forma: 'pix' as const })), cobrancas: [] } });
  await fiado('Cliente Exemplo A', 180, 12, -5, [60]);
  await fiado('Cliente Exemplo B', 95.5, 3, 0);
  await fiado('Cliente Exemplo C', 240, 1, 6);
  await fiado('Cliente Exemplo D', 75, 20, -12, [75]);
}

export async function carregarGestaoDemo() {
  const { repo: contas, sessao } = await repositorioDemo();
  const lojas = (await contas.lojas(sessao.contaId)).map((l) => l.codigo);
  let registros: Registro[] | null = null;
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo) registros = lerEstadoGestao(salvo);
  } catch {
    registros = null;
  }
  if (registros && !registros.every((x) => x.contaId === sessao.contaId)) registros = null;
  repo = new RepositorioGestaoMemoria(registros ?? [], salvar);
  if (!registros) {
    await semear(repo, sessao.contaId, sessao.usuarioId, lojas);
    salvar(repo.registros);
  }
}

export function repositorioGestao(): RepositorioGestao | null {
  return repo;
}

export function definirRepositorioGestao(r: RepositorioGestao | undefined) {
  repo = (r as RepositorioGestaoMemoria) ?? null;
}
