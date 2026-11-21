import { velocidadeNaAbertura, type Velocidade } from '../conferencia/premios';
import type { LotericaRef } from '../dominio/tipos';
import type { AberturaInfo, ParticipacaoInfo } from '../raio-x/semanal';
import { pagina } from '../regras/posicao';
import { diaSP, horaSP, isodowDoDia, somarDias } from '../tempo/fuso';
import { media, mediana } from '../util/estatistica';

/**
 * "Posição na abertura" da SUA lotérica (Fase 3): 7/30/90 dias, por dia da semana (você x outras
 * lotéricas da UF: % na pág. 1 da UF e página média) e calendário "Abriu rápido?".
 * Só vale o 1º bolão da 1ª hora; entrou mais de 30 min depois não conta (já garantido nas participações).
 */
export interface DiaSemanaPosicao {
  isodow: number;
  aberturas: number;
  minhas: number;
  pctPagina1Uf: number | null;
  paginaMediaUf: number | null;
  paginaMediaUfOutras: number | null;
  atrasoMedianoS: number | null;
}

export interface DiaCalendario {
  dia: string;
  isodow: number;
  houveAbertura: boolean;
  participou: boolean;
  aberturaId?: string;
  hora?: string;
  atrasoS?: number;
  velocidade?: Velocidade;
  posUf?: number;
  paginaUf?: number;
}

export interface PosicaoNaAbertura {
  dias: number;
  de: string;
  ate: string;
  resumo: { aberturas: number; minhas: number; pctPagina1Uf: number | null; paginaMediaUf: number | null; paginaMediaUfOutras: number | null; rapidas: number; medias: number; lentas: number };
  porDiaSemana: DiaSemanaPosicao[];
  calendario: DiaCalendario[];
}

export function posicaoNaAbertura(
  loterica: LotericaRef,
  aberturas: readonly AberturaInfo[],
  participacoes: readonly ParticipacaoInfo[],
  lotericas: ReadonlyMap<string, LotericaRef>,
  o: { dias: number; ate: Date },
): PosicaoNaAbertura {
  const ateDia = diaSP(o.ate);
  const deDia = somarDias(ateDia, -(o.dias - 1));
  const noPeriodo = new Map<string, AberturaInfo>();
  for (const a of aberturas) {
    const d = diaSP(a.t0);
    if (d >= deDia && d <= ateDia && a.t0.getTime() <= o.ate.getTime()) noPeriodo.set(a.id, a);
  }
  const minhas: { p: ParticipacaoInfo; a: AberturaInfo }[] = [];
  const outras: { p: ParticipacaoInfo; a: AberturaInfo }[] = [];
  for (const p of participacoes) {
    const a = noPeriodo.get(p.aberturaId);
    if (!a) continue;
    if (p.lotericaCodigo === loterica.codigoCaixa) minhas.push({ p, a });
    else if (lotericas.get(p.lotericaCodigo)?.uf === loterica.uf) outras.push({ p, a });
  }
  const pg = (x: { p: ParticipacaoInfo }) => pagina(x.p.posUf);
  const porDiaSemana: DiaSemanaPosicao[] = [1, 2, 3, 4, 5, 6, 7].map((isodow) => {
    const doDia = (xs: { a: AberturaInfo }[]) => xs.filter((x) => isodowDoDia(diaSP(x.a.t0)) === isodow);
    const m = doDia(minhas) as typeof minhas;
    const ou = doDia(outras) as typeof outras;
    return {
      isodow,
      aberturas: [...noPeriodo.values()].filter((a) => isodowDoDia(diaSP(a.t0)) === isodow).length,
      minhas: m.length,
      pctPagina1Uf: m.length ? m.filter((x) => pg(x) === 1).length / m.length : null,
      paginaMediaUf: media(m.map(pg)),
      paginaMediaUfOutras: media(ou.map(pg)),
      atrasoMedianoS: mediana(m.map((x) => x.p.atrasoS)),
    };
  });
  const calendario: DiaCalendario[] = [];
  for (let d = deDia; d <= ateDia; d = somarDias(d, 1)) {
    const houve = [...noPeriodo.values()].some((a) => diaSP(a.t0) === d);
    const doDia = minhas.filter((x) => diaSP(x.a.t0) === d).sort((x, y) => x.p.atrasoS - y.p.atrasoS);
    const melhor = doDia[0];
    calendario.push({
      dia: d,
      isodow: isodowDoDia(d),
      houveAbertura: houve,
      participou: Boolean(melhor),
      ...(melhor
        ? {
            aberturaId: melhor.a.id,
            hora: horaSP(melhor.p.primeiroEm),
            atrasoS: melhor.p.atrasoS,
            velocidade: velocidadeNaAbertura(melhor.p.atrasoS),
            posUf: melhor.p.posUf,
            paginaUf: pagina(melhor.p.posUf),
          }
        : {}),
    });
  }
  const vel = calendario.filter((c) => c.velocidade);
  return {
    dias: o.dias,
    de: deDia,
    ate: ateDia,
    resumo: {
      aberturas: noPeriodo.size,
      minhas: minhas.length,
      pctPagina1Uf: minhas.length ? minhas.filter((x) => pg(x) === 1).length / minhas.length : null,
      paginaMediaUf: media(minhas.map(pg)),
      paginaMediaUfOutras: media(outras.map(pg)),
      rapidas: vel.filter((c) => c.velocidade === 'rapido').length,
      medias: vel.filter((c) => c.velocidade === 'medio').length,
      lentas: vel.filter((c) => c.velocidade === 'lento').length,
    },
    porDiaSemana,
    calendario,
  };
}
