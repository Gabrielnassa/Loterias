import type { ModalidadeSlug } from '../dominio/modalidades';
import type { BolaoHistorico } from '../mercado/estatisticas';
import type { BolaoMercado } from '../mercado/vitrine';
import { horarioSP } from '../tempo/fuso';
import { gerarAberturaSimulada, type AberturaSimulada, type BolaoVerdade } from './abertura-simulada';
import type { HistoricoSimulado } from './historico';

/**
 * Mercado SIMULADO (Fase 4): a vitrine de cada concurso do histórico simulado vista até `ate`
 * (nada do futuro: vendas e bolões depois de `ate` não aparecem). Lotéricas fictícias.
 */
export function bolaoMercadoDaVerdade(v: BolaoVerdade, ate: number): BolaoMercado | null {
  const entrou = v.chegadaEm.getTime();
  if (entrou > ate) return null;
  const total = v.bolao.cotasTotal;
  let restantes = total;
  let antes = 0;
  const mudancas: [number, number][] = [];
  for (const t of v.vendas) {
    if (t > ate) break;
    if (t <= entrou) {
      antes++;
      continue;
    }
    restantes = total - antes - mudancas.length - 1;
    mudancas.push([t, restantes]);
  }
  return {
    id: v.bolao.idCaixa,
    loterica: v.bolao.loterica,
    modalidade: v.bolao.modalidade,
    concurso: v.bolao.concurso,
    jogos: v.bolao.jogos,
    dezenas: v.bolao.dezenas,
    cotasTotal: total,
    valorCotaBase: v.bolao.valorCotaBase,
    fila: v.fila,
    entrouEm: entrou,
    disponiveisNaEntrada: total - antes,
    mudancas,
    saiuEm: null,
  };
}

export function vitrineSimulada(sim: AberturaSimulada, ate: Date | number): BolaoMercado[] {
  const t = typeof ate === 'number' ? ate : ate.getTime();
  const out: BolaoMercado[] = [];
  for (const b of sim.boloes) {
    const m = bolaoMercadoDaVerdade(b, t);
    if (m) out.push(m);
  }
  return out;
}

export interface ConcursoSimulado {
  id: string;
  modalidade: ModalidadeSlug;
  concurso: number;
  abreEm: Date;
  fechaEm: Date;
  especial: boolean;
  sorteioEm?: Date;
  premioEstimado?: number;
}

/** Concursos à venda em `agora` (T0 <= agora < fechamento), o mais recente de cada modalidade. */
export function concursosAVendaSimulados(h: HistoricoSimulado, agora: Date): ConcursoSimulado[] {
  const porModalidade = new Map<ModalidadeSlug, ConcursoSimulado>();
  for (const p of h.planos) {
    const fecha = h.fechaEm(p.id)!;
    if (p.t0.getTime() > agora.getTime()) continue;
    const atual = porModalidade.get(p.modalidade);
    if (!atual || atual.abreEm.getTime() < p.t0.getTime()) {
      porModalidade.set(p.modalidade, { id: p.id, modalidade: p.modalidade, concurso: p.concurso, abreEm: p.t0, fechaEm: fecha, especial: false });
    }
  }
  return [...porModalidade.values()].filter((c) => c.fechaEm.getTime() > agora.getTime() || agora.getTime() - c.fechaEm.getTime() < 3 * 3_600_000);
}

/**
 * Bolões de todos os concursos simulados até `agora`, no formato das estatísticas (ficha da
 * lotérica, top 10). Disponíveis = no instante `agora` ou no fechamento.
 */
export function historicoDeBoloesSimulado(h: HistoricoSimulado, agora: Date): BolaoHistorico[] {
  const t = agora.getTime();
  const out: BolaoHistorico[] = [];
  for (const p of h.planos) {
    const sim = h.verdade(p.id);
    if (!sim) continue;
    const fecha = sim.fechaEm.getTime();
    const ate = Math.min(t, fecha);
    for (const b of sim.boloes) {
      if (b.chegadaEm.getTime() > ate) continue;
      let vendidas = 0;
      while (vendidas < b.vendas.length && b.vendas[vendidas]! <= ate) vendidas++;
      const esgotou = vendidas === b.bolao.cotasTotal ? b.vendas[vendidas - 1]! : null;
      out.push({
        id: b.bolao.idCaixa,
        loterica: b.bolao.loterica,
        modalidade: b.bolao.modalidade,
        concurso: b.bolao.concurso,
        jogos: b.bolao.jogos,
        dezenas: b.bolao.dezenas,
        cotasTotal: b.bolao.cotasTotal,
        valorCotaBase: b.bolao.valorCotaBase,
        entrouEm: b.chegadaEm,
        esgotouEm: esgotou === null ? null : new Date(esgotou),
        disponiveis: b.bolao.cotasTotal - vendidas,
        encerrado: fecha <= t,
      });
    }
  }
  return out;
}

function hash(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
}

/**
 * Mega da Virada SIMULADA do ano de `agora`: vendas desde o início de novembro até 31/12, sorteio
 * às 20h. Prêmio e datas são de demonstração (no banco vêm de `concursos`).
 */
export function megaDaViradaSimulada(h: HistoricoSimulado, agora: Date): ConcursoSimulado & { sim: AberturaSimulada } {
  const ano = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(agora));
  const abreEm = horarioSP(ano, 11, 3, 8, 0);
  const fechaEm = horarioSP(ano, 12, 31, 17, 0);
  const sorteioEm = horarioSP(ano, 12, 31, 20, 0);
  const janela = fechaEm.getTime() - abreEm.getTime();
  const r = { x: hash(`virada|${ano}`) };
  const proximo = () => {
    r.x = (Math.imul(r.x, 1664525) + 1013904223) >>> 0;
    return r.x / 2 ** 32;
  };
  const participantes = h.perfis
    .filter(() => proximo() < 0.85)
    .map((p) => ({
      loterica: p.loterica,
      // quem é rápido entra cedo; a maioria monta ao longo das semanas, com pico perto do fim
      atrasoPrimeiroS: ((p.velocidade === 'relampago' ? 0.02 : p.velocidade === 'rapida' ? 0.1 : 0.3) + proximo() * 0.5) * (janela / 1000) * 0.6,
      nBoloes: Math.max(2, Math.round(p.boloesMedio * 3 * (0.5 + proximo()))),
    }));
  const sim = gerarAberturaSimulada({ semente: hash(`virada-sim|${ano}`), t0: abreEm, fechaEm, modalidade: 'mega-sena', concurso: 2950 + (ano - 2026), participantes });
  return {
    id: `virada-${ano}`,
    modalidade: 'mega-sena',
    concurso: sim.concurso,
    abreEm,
    fechaEm,
    sorteioEm,
    especial: true,
    premioEstimado: 850_000_000,
    sim,
  };
}
