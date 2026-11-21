import type { ModalidadeSlug } from '../dominio/modalidades';
import { breakEvenGrupo, resultadoBolao, somarResultados, type BolaoFinanceiro, type BreakEven, type ResultadoFinanceiro } from '../regras/financeiro';
import { diaSP } from '../tempo/fuso';

/**
 * Bolões e Financeiro MKP da SUA lotérica (Fase 3). Internet x balcão: as cotas oferecidas na
 * internet são `cotasDigitais`; o restante do total foi impresso no TFL (balcão) e conta como
 * vendido. Bolão ainda à venda: resultado PARCIAL (o que está disponível conta como sobra se fechasse agora).
 */
export interface BolaoMinha {
  id: string;
  modalidade: ModalidadeSlug;
  concurso: number;
  inseridoEm: Date;
  /** Dia do sorteio (YYYY-MM-DD), se conhecido. */
  diaSorteio?: string | null;
  cotasTotal: number;
  cotasDigitais?: number | null;
  cotasDisponiveis: number;
  valorCotaBase: number;
  tarifaPorCotaFonte?: number | null;
  contemResiduo?: boolean;
  valorUltimaCotaBase?: number | null;
  sobraFinal: number | null;
  estornado: boolean;
}

export interface FinanceiroBolao extends ResultadoFinanceiro {
  id: string;
  modalidade: ModalidadeSlug;
  concurso: number;
  dia: string;
  vendidasInternet: number;
  vendidasBalcao: number;
  encerrado: boolean;
  estornado: boolean;
}

export function paraFinanceiro(b: BolaoMinha): BolaoFinanceiro {
  const digitais = b.cotasDigitais ?? b.cotasTotal;
  const disponiveis = b.sobraFinal ?? b.cotasDisponiveis;
  return {
    cotasTotal: b.cotasTotal,
    valorCotaBase: b.valorCotaBase,
    cotasVendidasInternet: Math.max(0, digitais - disponiveis),
    cotasVendidasBalcao: Math.max(0, b.cotasTotal - digitais),
    estornado: b.estornado,
    ...(b.tarifaPorCotaFonte !== null && b.tarifaPorCotaFonte !== undefined ? { tarifaPorCotaFonte: b.tarifaPorCotaFonte } : {}),
    ...(b.contemResiduo ? { contemResiduo: true } : {}),
    ...(b.valorUltimaCotaBase !== null && b.valorUltimaCotaBase !== undefined ? { valorUltimaCotaBase: b.valorUltimaCotaBase } : {}),
  };
}

export function financeiroDoBolao(b: BolaoMinha): FinanceiroBolao {
  const f = paraFinanceiro(b);
  return {
    ...resultadoBolao(f),
    id: b.id,
    modalidade: b.modalidade,
    concurso: b.concurso,
    dia: b.diaSorteio ?? diaSP(b.inseridoEm),
    vendidasInternet: f.cotasVendidasInternet,
    vendidasBalcao: f.cotasVendidasBalcao ?? 0,
    encerrado: b.sobraFinal !== null,
    estornado: b.estornado,
  };
}

/** Break-even dos bolões ainda à venda, agrupados por loteria e concurso ("N cotas pro break-even"). */
export function breakEvenPorConcurso(boloes: readonly BolaoMinha[]): { modalidade: ModalidadeSlug; concurso: number; breakEven: BreakEven }[] {
  const grupos = new Map<string, BolaoMinha[]>();
  for (const b of boloes) {
    if (b.sobraFinal !== null) continue;
    const k = `${b.modalidade}#${b.concurso}`;
    const g = grupos.get(k);
    if (g) g.push(b);
    else grupos.set(k, [b]);
  }
  return [...grupos.values()].map((g) => ({ modalidade: g[0]!.modalidade, concurso: g[0]!.concurso, breakEven: breakEvenGrupo(g.map(paraFinanceiro)) }));
}

export interface ResumoFinanceiro {
  total: ResultadoFinanceiro;
  porDia: (ResultadoFinanceiro & { dia: string })[];
  porModalidade: (ResultadoFinanceiro & { modalidade: ModalidadeSlug })[];
  maioresLucros: FinanceiroBolao[];
  maioresPrejuizos: FinanceiroBolao[];
  boloes: FinanceiroBolao[];
}

export function resumoFinanceiro(boloes: readonly BolaoMinha[], top = 5): ResumoFinanceiro {
  const linhas = boloes.map(financeiroDoBolao);
  const agrupar = <K extends string>(chave: (l: FinanceiroBolao) => K) => {
    const m = new Map<K, FinanceiroBolao[]>();
    for (const l of linhas) {
      const k = chave(l);
      const g = m.get(k);
      if (g) g.push(l);
      else m.set(k, [l]);
    }
    return m;
  };
  const validos = linhas.filter((l) => !l.estornado);
  return {
    total: somarResultados(linhas),
    porDia: [...agrupar((l) => l.dia).entries()].map(([dia, g]) => ({ dia, ...somarResultados(g) })).sort((a, b) => (a.dia < b.dia ? 1 : -1)),
    porModalidade: [...agrupar((l) => l.modalidade).entries()].map(([modalidade, g]) => ({ modalidade, ...somarResultados(g) })),
    maioresLucros: [...validos].filter((l) => l.lucro > 0).sort((a, b) => b.lucro - a.lucro).slice(0, top),
    maioresPrejuizos: [...validos].filter((l) => l.lucro < 0).sort((a, b) => a.lucro - b.lucro).slice(0, top),
    boloes: linhas,
  };
}
