import type { BolaoDaAbertura } from '../abertura/participacao';
import { posicoesNaEntrada, type BolaoNaVitrine } from '../regras/posicao';
import { cronogramaAbertura, disponiveisEm, esgotaEm, type AberturaSimulada } from './abertura-simulada';

/**
 * "Coletor rápido" para simulação: produz o MESMO resultado que passar cada leitura do cronograma
 * por `aplicarLeitura` (first_seen_at = 1ª leitura em que o bolão estava visível, fila, colocação
 * na entrada, empate), mas em O(n · filas) em vez de O(leituras · n). Usado para gerar semanas de
 * histórico simulado (web) sem rodar centenas de milhares de leituras. Teste de equivalência em
 * test/historico.test.ts.
 */
export interface BolaoColetadoSimulado extends BolaoDaAbertura {
  jogos: number;
  dezenas: number;
  chegadaReal: Date;
  esgotouEm: Date | null;
}

export function coletarSimulacao(
  sim: AberturaSimulada,
  opcoes: { leituras?: readonly Date[]; ate?: Date } = {},
): BolaoColetadoSimulado[] {
  const ate = opcoes.ate?.getTime() ?? Number.POSITIVE_INFINITY;
  const leituras = (opcoes.leituras ?? cronogramaAbertura(sim.t0)).map((d) => d.getTime()).filter((t) => t <= ate);
  const fecha = sim.fechaEm.getTime();

  const primeiraLeitura = (t: number): number | null => {
    let lo = 0;
    let hi = leituras.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (leituras[mid]! < t) lo = mid + 1;
      else hi = mid;
    }
    return lo < leituras.length ? leituras[lo]! : null;
  };

  const vistos: { b: AberturaSimulada['boloes'][number]; primeiro: number }[] = [];
  for (const b of sim.boloes) {
    const t = primeiraLeitura(b.chegadaEm.getTime());
    if (t === null || t >= fecha) continue;
    if (disponiveisEm(b, t) <= 0) continue; // esgotou antes de ser lido: nunca aparece
    vistos.push({ b, primeiro: t });
  }
  const porLeitura = new Map<number, number>();
  for (const v of vistos) porLeitura.set(v.primeiro, (porLeitura.get(v.primeiro) ?? 0) + 1);

  const vitrine: BolaoNaVitrine[] = vistos.map(({ b, primeiro }) => {
    const fim = esgotaEm(b);
    return {
      id: b.bolao.idCaixa,
      lotericaCodigo: b.bolao.loterica.codigoCaixa,
      loterica: b.bolao.loterica,
      fila: b.fila,
      firstSeenAt: new Date(primeiro),
      ordemFonte: b.chegadaEm.getTime(),
      saiuEm: fim === null ? null : new Date(fim),
    };
  });
  const posicoes = posicoesNaEntrada(vitrine);
  const fim = Math.min(ate, fecha - 1);
  const encerrado = ate >= fecha;

  return vistos.map(({ b, primeiro }) => {
    const esg = esgotaEm(b);
    const disp = disponiveisEm(b, fim);
    return {
      id: b.bolao.idCaixa,
      loterica: b.bolao.loterica,
      firstSeenAt: new Date(primeiro),
      ordemFonte: b.chegadaEm.getTime(),
      fila: b.fila,
      cotasTotal: b.bolao.cotasTotal,
      valorCotaBase: b.bolao.valorCotaBase,
      cotasDisponiveis: disp,
      sobraFinal: encerrado ? disp : null,
      posEntrada: posicoes.get(b.bolao.idCaixa)!,
      empate: (porLeitura.get(primeiro) ?? 0) > 1,
      jogos: b.bolao.jogos,
      dezenas: b.bolao.dezenas,
      chegadaReal: b.chegadaEm,
      esgotouEm: esg !== null && esg <= fim ? new Date(esg) : null,
    };
  });
}
