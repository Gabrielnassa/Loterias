import { fmtHora } from './formato';
import type { Coluna } from './exportar';
import type { boloesMkp, conferenciaMkp, financeiroMkp } from './minha';

type LinhaBolao = Awaited<ReturnType<typeof boloesMkp>>['linhas'][number];
type LinhaFin = Awaited<ReturnType<typeof financeiroMkp>>['boloes'][number];
type LinhaConf = Awaited<ReturnType<typeof conferenciaMkp>>['linhas'][number];

const R = '#,##0.00';

export const COLUNAS_BOLOES: Coluna<LinhaBolao>[] = [
  { titulo: 'Modalidade', valor: (l) => l.modalidade },
  { titulo: 'Concurso', valor: (l) => l.concurso },
  { titulo: 'Entrada', valor: (l) => `${l.entradaEm.toISOString().slice(0, 10)} ${fmtHora(l.entradaEm)}` },
  { titulo: 'Formato', valor: (l) => l.formato },
  { titulo: 'Situação', valor: (l) => (l.estornado ? 'estornado' : l.status) },
  { titulo: 'Cotas', valor: (l) => l.cotasTotal },
  { titulo: 'Vendidas internet', valor: (l) => l.vendidasInternet },
  { titulo: 'Balcão (impressas)', valor: (l) => l.vendidasBalcao },
  { titulo: 'Disponíveis', valor: (l) => l.disponiveis },
  { titulo: 'Valor da cota (R$)', valor: (l) => l.valorCota, formato: R },
  { titulo: 'Recebido (R$)', valor: (l) => l.recebido, formato: R },
  { titulo: 'Custo/sobra (R$)', valor: (l) => l.custo, formato: R },
  { titulo: 'Tarifa (R$)', valor: (l) => l.tarifa, formato: R },
  { titulo: 'Comissão (R$)', valor: (l) => l.comissao, formato: R },
  { titulo: 'Lucro (R$)', valor: (l) => l.lucro, formato: R },
  { titulo: 'Fila', valor: (l) => l.fila },
  { titulo: 'Posição UF (entrada)', valor: (l) => l.colocacaoEntrada.uf.posicao },
  { titulo: 'Posição UF (atual)', valor: (l) => l.colocacaoAtual?.uf.posicao ?? null },
];

export const COLUNAS_FINANCEIRO: Coluna<LinhaFin>[] = [
  { titulo: 'Dia', valor: (l) => l.dia },
  { titulo: 'Modalidade', valor: (l) => l.modalidade },
  { titulo: 'Concurso', valor: (l) => l.concurso },
  { titulo: 'Encerrado', valor: (l) => (l.encerrado ? 'sim' : 'não') },
  { titulo: 'Estornado', valor: (l) => (l.estornado ? 'sim' : 'não') },
  { titulo: 'Cotas vendidas', valor: (l) => l.cotasVendidas },
  { titulo: 'Internet', valor: (l) => l.vendidasInternet },
  { titulo: 'Balcão', valor: (l) => l.vendidasBalcao },
  { titulo: 'Sobradas', valor: (l) => l.cotasSobradas },
  { titulo: 'Apostas (R$)', valor: (l) => l.apostas, formato: R },
  { titulo: 'Recebido internet (R$)', valor: (l) => l.recebidoInternet, formato: R },
  { titulo: 'Recebido balcão (R$)', valor: (l) => l.recebidoBalcao, formato: R },
  { titulo: 'Tarifa (R$)', valor: (l) => l.tarifa, formato: R },
  { titulo: 'Comissão (R$)', valor: (l) => l.comissao, formato: R },
  { titulo: 'Sobra (R$)', valor: (l) => l.sobra, formato: R },
  { titulo: 'Lucro (R$)', valor: (l) => l.lucro, formato: R },
];

export const COLUNAS_CONFERENCIA: Coluna<LinhaConf>[] = [
  { titulo: 'Modalidade', valor: (l) => l.modalidade },
  { titulo: 'Concurso', valor: (l) => l.concurso },
  { titulo: 'Apuração', valor: (l) => l.dataApuracao },
  { titulo: 'Sorteio', valor: (l) => l.sorteio },
  { titulo: 'Formato', valor: (l) => l.formato },
  { titulo: 'Melhor acerto', valor: (l) => l.melhorAcerto ?? '' },
  { titulo: 'Faixas', valor: (l) => l.faixasTexto.join('; ') },
  { titulo: 'Prêmio total (R$)', valor: (l) => l.premioTotal, formato: R },
  { titulo: 'Prêmio por cota (R$)', valor: (l) => l.premioPorCota, formato: R },
  { titulo: 'Cotas sobradas', valor: (l) => l.cotasSobradas },
  { titulo: 'Seu prêmio (R$)', valor: (l) => l.premioLoterica, formato: R },
  { titulo: 'Resultado', valor: (l) => (l.origemResultado === 'seed' ? 'simulado' : 'oficial CAIXA') },
  { titulo: 'Avisos', valor: (l) => l.avisos.join('; ') },
];
