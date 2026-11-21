import { chanceDeAlgumPremio, probabilidadesDoJogo } from '../conferencia/probabilidade';
import { semAcento } from '../dominio/jogo';
import type { ModalidadeSlug } from '../dominio/modalidades';
import { tarifaPorCota } from '../regras/financeiro';
import { diaSP } from '../tempo/fuso';
import { centavos } from '../util/estatistica';

/**
 * Site público da lotérica (Fase 5): regras puras de endereço (slug), links de WhatsApp e da CAIXA,
 * chance do prêmio de cada bolão, filtros e métricas de acesso (sem dado pessoal: o visitante é um
 * id aleatório do navegador).
 */

/** Primeiro nível de rota já usado pelo painel: não pode virar endereço de lotérica. */
export const ROTAS_RESERVADAS = new Set([
  'api', 'minha', 'mercado', 'estatisticas', 'mega-da-virada', 'ranking', 'comparar', 'ao-vivo', 'aberturas', 'lotericas',
  'sitemap.xml', 'robots.txt', 'favicon.ico', '_next', 'calendario', 'simulador', 'loteca', 'admin', 'login',
]);

export function slugDoNome(nome: string): string {
  return semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export function slugValido(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 60 && !ROTAS_RESERVADAS.has(slug);
}

/** Só dígitos; número brasileiro sem DDI (10 ou 11 dígitos) ganha o 55. */
export function normalizarWhatsapp(numero: string | null | undefined): string | null {
  const d = (numero ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d.length >= 12 && d.length <= 15 ? d : null;
}

export function linkWhatsapp(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** Link público da lotérica no portal Loterias CAIXA (rota `#/bolao-caixa/{código}`, sem login). */
export function linkCaixaLoterica(codigo: string, sobrescrever?: string | null): string {
  return sobrescrever || `https://www.loteriasonline.caixa.gov.br/silce-web/#/bolao-caixa/${codigo}`;
}

/** Valor da cota que o cliente paga (base + tarifa de serviço truncada). */
export function valorCotaComTarifa(valorBase: number, tarifaInformada?: number | null): number {
  return centavos(valorBase + (tarifaInformada ?? tarifaPorCota(valorBase)));
}

export interface ItemPedido {
  modalidade: string;
  concurso: number;
  formato: string;
  cotas: number;
  valorCota: number;
}

/** Mensagem do pedido/reserva pelo WhatsApp (o cliente confirma com a lotérica). */
export function mensagemPedido(nomeLoterica: string, itens: readonly ItemPedido[]): string {
  if (!itens.length) return `Olá, ${nomeLoterica}! Quero saber dos bolões disponíveis.`;
  const linhas = itens.map((i) => `• ${i.cotas} cota${i.cotas > 1 ? 's' : ''} ${i.modalidade} ${i.concurso} (${i.formato}) a R$ ${i.valorCota.toFixed(2).replace('.', ',')}`);
  const total = centavos(itens.reduce((s, i) => s + i.cotas * i.valorCota, 0));
  return [`Olá, ${nomeLoterica}! Quero reservar:`, ...linhas, `Total: R$ ${total.toFixed(2).replace('.', ',')}`].join('\n');
}

export interface ChanceBolao {
  /** Chance do prêmio principal (aprox.: soma dos jogos), "1 em X". */
  principalUmEm: number | null;
  /** Chance de algum prêmio em pelo menos um jogo (aprox.), "1 em X". */
  algumPremioUmEm: number | null;
  descricaoPrincipal: string | null;
}

/**
 * Chance do bolão: soma das chances dos jogos (os jogos de um bolão são diferentes; a soma é uma
 * aproximação boa para eventos raros). Usa as mesmas tabelas oficiais de probabilidade.
 */
export function chanceDoBolao(modalidade: ModalidadeSlug, jogos: number, dezenas: number): ChanceBolao {
  if (modalidade === 'loteca') return { principalUmEm: null, algumPremioUmEm: null, descricaoPrincipal: null };
  try {
    const fs = probabilidadesDoJogo(modalidade, { numeros: dezenas });
    const p1 = fs[0]!;
    // Dupla Sena: o prêmio principal pode sair em qualquer um dos 2 sorteios
    const porJogo = modalidade === 'dupla-sena' ? 1 - (1 - p1.probabilidade) ** 2 : p1.probabilidade;
    const principal = Math.min(1, porJogo * jogos);
    const qualquer = 1 - (1 - Math.min(1, chanceDeAlgumPremio(modalidade, { numeros: dezenas }))) ** jogos;
    return {
      principalUmEm: principal > 0 ? Math.round(1 / principal) : null,
      algumPremioUmEm: qualquer > 0 ? Math.max(1, Math.round((1 / qualquer) * 10) / 10) : null,
      descricaoPrincipal: p1.descricao,
    };
  } catch {
    return { principalUmEm: null, algumPremioUmEm: null, descricaoPrincipal: null };
  }
}

export type OrdemSite = 'concurso' | 'preco' | 'restam';

export interface BolaoDoSite {
  id: string;
  modalidade: ModalidadeSlug;
  concurso: number;
  jogos: number;
  dezenas: number;
  cotasTotal: number;
  disponiveis: number;
  valorCotaBase: number;
  fechaEm: Date | null;
}

export function filtrarBoloesDoSite<T extends BolaoDoSite>(boloes: readonly T[], f: { modalidade?: ModalidadeSlug | null; valorMax?: number | null; ordem?: OrdemSite }): T[] {
  const r = boloes.filter((b) => b.disponiveis > 0 && (!f.modalidade || b.modalidade === f.modalidade) && (!f.valorMax || valorCotaComTarifa(b.valorCotaBase) <= f.valorMax));
  const ordem = f.ordem ?? 'concurso';
  return r.sort((a, b) =>
    ordem === 'preco'
      ? a.valorCotaBase - b.valorCotaBase
      : ordem === 'restam'
        ? a.disponiveis - b.disponiveis
        : (a.fechaEm?.getTime() ?? Infinity) - (b.fechaEm?.getTime() ?? Infinity) || a.modalidade.localeCompare(b.modalidade) || a.valorCotaBase - b.valorCotaBase,
  );
}

export type TipoEventoSite = 'visita' | 'whatsapp' | 'caixa' | 'carrinho';

export interface EventoSite {
  em: Date;
  tipo: TipoEventoSite;
  visitante: string;
}

export interface MetricasSite {
  visitas: number;
  pessoas: number;
  whatsapp: number;
  caixa: number;
  carrinho: number;
  /** Cliques (WhatsApp + CAIXA) por visita. */
  conversao: number | null;
  porDia: { dia: string; visitas: number; pessoas: number; whatsapp: number; caixa: number; carrinho: number }[];
}

export function metricasDoSite(eventos: readonly EventoSite[]): MetricasSite {
  const dias = new Map<string, { visitas: number; pessoas: Set<string>; whatsapp: number; caixa: number; carrinho: number }>();
  const pessoas = new Set<string>();
  const tot = { visitas: 0, whatsapp: 0, caixa: 0, carrinho: 0 };
  for (const e of eventos) {
    const d = diaSP(e.em);
    const a = dias.get(d) ?? { visitas: 0, pessoas: new Set<string>(), whatsapp: 0, caixa: 0, carrinho: 0 };
    if (e.tipo === 'visita') {
      a.visitas++;
      tot.visitas++;
      a.pessoas.add(e.visitante);
      pessoas.add(e.visitante);
    } else {
      a[e.tipo]++;
      tot[e.tipo]++;
    }
    dias.set(d, a);
  }
  return {
    ...tot,
    pessoas: pessoas.size,
    conversao: tot.visitas ? (tot.whatsapp + tot.caixa) / tot.visitas : null,
    porDia: [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, a]) => ({ dia, visitas: a.visitas, pessoas: a.pessoas.size, whatsapp: a.whatsapp, caixa: a.caixa, carrinho: a.carrinho })),
  };
}
