import {
  chanceDeAbrir,
  compararLotericas,
  diaSP,
  ehModalidade,
  formatarCodigoBolao,
  gradeSemanal,
  inicioDoDiaSP,
  metricasSemanais,
  ordemDeChegada,
  pagina,
  rankingAberturas,
  semanaSP,
  somarDias,
  tendencia,
  type CriterioRanking,
  type Escopo,
  type LotericaRef,
  type ModalidadeSlug,
  type ParticipacaoInfo,
} from '@radar/core';
import type { FonteDadosRaioX } from './dados';

/**
 * Casos de uso da web (telas 1 a 5 e API). Funções sobre a FonteDadosRaioX + regras do core;
 * as páginas e as rotas da API só chamam estas funções.
 */
export type ModalidadeFiltro = ModalidadeSlug | 'todas';

export function lerEscopo(v: string | null | undefined, padrao: Escopo = 'uf'): Escopo {
  return v === 'cidade' || v === 'uf' || v === 'brasil' ? v : padrao;
}
export function lerModalidade(v: string | null | undefined): ModalidadeFiltro {
  return v && ehModalidade(v) ? v : 'todas';
}
export function lerSemanas(v: string | null | undefined, padrao = 12, max = 13): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : padrao;
}
export function lerCriterio(v: string | null | undefined): CriterioRanking {
  return v === 'mais_rapida' || v === 'mais_pagina1' ? v : 'mais_aberturas';
}

/** Tela 1: aba "Aberturas" da ficha da lotérica (GET /api/lotericas/{codigo}/aberturas). */
export async function fichaAberturas(
  fonte: FonteDadosRaioX,
  codigo: string,
  o: { semanas?: number; modalidade?: ModalidadeFiltro; escopo?: Escopo } = {},
) {
  const loterica = await fonte.loterica(codigo);
  if (!loterica) return null;
  const agora = fonte.agora();
  const filtro = { ate: agora, semanas: o.semanas ?? 12, modalidade: o.modalidade ?? 'todas', escopo: o.escopo ?? 'uf' } as const;
  const [aberturas, participacoes] = await Promise.all([fonte.aberturas(), fonte.participacoes()]);
  const metricas = metricasSemanais(codigo, aberturas, participacoes, filtro);
  const grade = gradeSemanal(codigo, aberturas, participacoes, filtro);
  const amanha = somarDias(diaSP(agora), 1);
  const todas = metricas.flatMap((m) => m.horarios);
  const totalOcorridas = metricas.reduce((s, m) => s + m.aberturasOcorridas, 0);
  const totalPart = metricas.reduce((s, m) => s + m.participacoes, 0);
  const mediana = (xs: number[]) => {
    if (!xs.length) return null;
    const v = [...xs].sort((a, b) => a - b);
    const m = (v.length - 1) / 2;
    return (v[Math.floor(m)]! + v[Math.ceil(m)]!) / 2;
  };
  return {
    loterica,
    filtro,
    resumo: {
      aberturasOcorridas: totalOcorridas,
      participacoes: totalPart,
      taxa: totalOcorridas ? totalPart / totalOcorridas : null,
      atrasoMedianoS: mediana(todas.map((x) => x.atrasoS)),
      melhorPosicao: todas.length ? Math.min(...todas.map((x) => x.posicao)) : null,
      posicaoMediana: mediana(todas.map((x) => x.posicao)),
      pctPagina1: todas.length ? todas.filter((x) => x.pagina === 1).length / todas.length : null,
    },
    tendencia: {
      participacoes: tendencia(metricas, 'participacoes', agora),
      posicaoMediana: tendencia(metricas, 'posicaoMediana', agora),
      atrasoMedianoS: tendencia(metricas, 'atrasoMedianoS', agora),
    },
    chanceAmanha: chanceDeAbrir(codigo, amanha, aberturas, participacoes, { modalidade: filtro.modalidade }),
    metricas,
    grade,
  };
}

/** Tela 2: detalhe da abertura — todos os bolões da janela. */
export async function detalheAbertura(fonte: FonteDadosRaioX, id: string, filtro: { uf?: string; cidade?: string } = {}) {
  const abertura = await fonte.abertura(id);
  if (!abertura) return null;
  const boloes = (await fonte.boloesDaAbertura(id)) ?? [];
  const t0 = abertura.t0.getTime();
  const linhas = boloes
    .filter((b) => b.firstSeenAt.getTime() <= t0 + 60 * 60_000)
    .filter((b) => (!filtro.uf || b.loterica.uf === filtro.uf) && (!filtro.cidade || b.loterica.cidade === filtro.cidade))
    .sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime() || a.posEntrada.brasil.posicao - b.posEntrada.brasil.posicao)
    .map((b) => {
      const vendidas = b.cotasTotal - (b.sobraFinal ?? b.cotasDisponiveis);
      const situacao = b.esgotouEm ? 'esgotou' : b.sobraFinal !== null ? (b.sobraFinal === 0 ? 'esgotou' : 'sobrou') : 'à venda';
      return {
        id: b.id,
        loterica: b.loterica,
        entradaEm: b.firstSeenAt,
        atrasoS: (b.firstSeenAt.getTime() - t0) / 1000,
        formato: formatarCodigoBolao({ jogos: b.jogos, dezenas: b.dezenas, cotas: b.cotasTotal }),
        fila: b.fila,
        cotasTotal: b.cotasTotal,
        cotasVendidas: vendidas,
        valorCota: b.valorCotaBase,
        valorTotal: Math.round(b.cotasTotal * b.valorCotaBase * 100) / 100,
        colocacao: b.posEntrada,
        situacao,
        sobra: b.sobraFinal,
        esgotouEm: b.esgotouEm,
        empate: b.empate,
      };
    });
  return {
    abertura,
    colocacaoDisponivel: abertura.escopoColocacao !== 'monitoradas',
    resumo: {
      boloes: linhas.length,
      lotericas: new Set(linhas.map((l) => l.loterica.codigoCaixa)).size,
      esgotados: linhas.filter((l) => l.situacao === 'esgotou').length,
      valorTotal: Math.round(linhas.reduce((s, l) => s + l.valorTotal, 0) * 100) / 100,
    },
    linhas,
  };
}

/** GET /api/aberturas/{id}/ranking: ordem de chegada da abertura num escopo. */
export async function rankingDaAbertura(fonte: FonteDadosRaioX, id: string, o: { escopo?: Escopo; uf?: string; cidade?: string } = {}) {
  const abertura = await fonte.abertura(id);
  if (!abertura) return null;
  const [participacoes, lotericas] = await Promise.all([fonte.participacoes(), fonte.lotericas()]);
  const porCodigo = new Map(lotericas.map((l) => [l.codigoCaixa, l]));
  const daAbertura = participacoes.filter((p) => p.aberturaId === id);
  const escopo = o.escopo ?? 'uf';
  const completas = daAbertura.map((p) => paraParticipacaoCompleta(p, porCodigo.get(p.lotericaCodigo)!));
  return {
    abertura,
    escopo,
    linhas: ordemDeChegada(completas, { ...(o.uf ? { uf: o.uf } : {}), ...(o.cidade ? { cidade: o.cidade } : {}) }).map((p) => ({
      ordem: p.ordem,
      loterica: p.loterica,
      primeiroEm: p.primeiroEm,
      atrasoS: p.atrasoS,
      posicao: escopo === 'cidade' ? p.posCidade : escopo === 'uf' ? p.posUf : p.posBrasil,
      pagina: escopo === 'cidade' ? p.paginaCidade : escopo === 'uf' ? p.paginaUf : p.paginaBrasil,
      nBoloes1h: p.nBoloes1h,
      valor1h: p.valor1h,
      empate: p.empate,
    })),
  };
}

function paraParticipacaoCompleta(p: ParticipacaoInfo, loterica: LotericaRef) {
  return {
    ...p,
    loterica,
    primeiroBolaoId: '',
    paginaCidade: pagina(p.posCidade),
    paginaUf: pagina(p.posUf),
    paginaBrasil: pagina(p.posBrasil),
    cotas1h: 0,
    pctVendido: p.pctVendido ?? 0,
    sobra: p.sobra ?? null,
    empate: p.empate ?? false,
  };
}

/** Tela 4: ranking por cidade/UF e período. */
export async function rankingPeriodo(
  fonte: FonteDadosRaioX,
  o: { uf?: string; cidade?: string; semanas?: number; modalidade?: ModalidadeFiltro; escopo?: Escopo; criterio?: CriterioRanking },
) {
  const agora = fonte.agora();
  const semanas = o.semanas ?? 4;
  const de = inicioDoDiaSP(somarDias(semanaSP(agora), -7 * (semanas - 1))); // segunda 00:00 em SP
  const [aberturas, participacoes, lotericas] = await Promise.all([fonte.aberturas(), fonte.participacoes(), fonte.lotericas()]);
  const mapa = new Map(lotericas.map((l) => [l.codigoCaixa, l]));
  const criterio = o.criterio ?? 'mais_aberturas';
  const linhas = rankingAberturas(
    aberturas,
    participacoes,
    mapa,
    {
      de,
      ate: agora,
      ...(o.uf ? { uf: o.uf } : {}),
      ...(o.cidade ? { cidade: o.cidade } : {}),
      modalidade: o.modalidade ?? 'todas',
      escopo: o.escopo ?? 'uf',
    },
    criterio,
  );
  return { de, ate: agora, semanas, criterio, escopo: o.escopo ?? 'uf', linhas };
}

/** Tela 3: você + até 5 concorrentes, quem chegou primeiro por dia. */
export async function compararGrade(
  fonte: FonteDadosRaioX,
  codigos: string[],
  o: { semanas?: number; modalidade?: ModalidadeFiltro; escopo?: Escopo } = {},
) {
  const unicos = [...new Set(codigos)].slice(0, 6);
  const lotericas = (await Promise.all(unicos.map((c) => fonte.loterica(c)))).filter((l): l is LotericaRef => l !== null);
  const agora = fonte.agora();
  const semanas = o.semanas ?? 4;
  const filtro = { ate: agora, semanas, modalidade: o.modalidade ?? 'todas', escopo: o.escopo ?? 'uf' } as const;
  const [aberturas, participacoes] = await Promise.all([fonte.aberturas(), fonte.participacoes()]);
  const de = inicioDoDiaSP(somarDias(semanaSP(agora), -7 * (semanas - 1)));
  const dias = compararLotericas(
    lotericas.map((l) => l.codigoCaixa),
    aberturas,
    participacoes,
    { de, ate: agora, modalidade: filtro.modalidade, escopo: filtro.escopo },
  );
  const grades = Object.fromEntries(lotericas.map((l) => [l.codigoCaixa, gradeSemanal(l.codigoCaixa, aberturas, participacoes, filtro)]));
  const vitorias = Object.fromEntries(lotericas.map((l) => [l.codigoCaixa, dias.filter((d) => d.primeiro === l.codigoCaixa).length]));
  return { lotericas, filtro, dias, grades, vitorias, primeiroPorDia: Object.fromEntries(dias.map((d) => [d.dia, d.primeiro])) };
}

/** Sugestão de concorrentes: quem mais abriu na mesma UF nas últimas semanas. */
export async function concorrentesSugeridos(fonte: FonteDadosRaioX, codigo: string, n = 5): Promise<string[]> {
  const l = await fonte.loterica(codigo);
  if (!l) return [];
  const r = await rankingPeriodo(fonte, { uf: l.uf, semanas: 4, criterio: 'mais_aberturas' });
  return r.linhas.map((x) => x.loterica.codigoCaixa).filter((c) => c !== codigo).slice(0, n);
}

/** Tela 5: ordem de chegada ao vivo da UF (SSE a cada 5 s). */
export async function aoVivo(fonte: FonteDadosRaioX, o: { uf?: string; cidade?: string; destaque?: string } = {}) {
  const agora = fonte.agora();
  const av = await fonte.aoVivo(agora);
  const ordem = ordemDeChegada(av.participacoes, { ...(o.uf ? { uf: o.uf } : {}), ...(o.cidade ? { cidade: o.cidade } : {}) });
  return {
    agora,
    emAndamento: av.emAndamento,
    t0: av.t0,
    modalidade: av.modalidade,
    ultimaLeitura: av.ultimaLeitura,
    total: av.participacoes.length,
    linhas: ordem.map((p) => ({
      ordem: p.ordem,
      loterica: p.loterica,
      primeiroEm: p.primeiroEm,
      atrasoS: p.atrasoS,
      posUf: p.posUf,
      paginaUf: p.paginaUf,
      posBrasil: p.posBrasil,
      nBoloes: p.nBoloes1h,
      empate: p.empate,
      destaque: o.destaque === p.loterica.codigoCaixa,
    })),
    minhaPosicao: o.destaque ? (ordem.find((p) => p.loterica.codigoCaixa === o.destaque)?.ordem ?? null) : null,
  };
}

/** UFs e cidades disponíveis (para os seletores). */
export async function locais(fonte: FonteDadosRaioX) {
  const ls = await fonte.lotericas();
  const ufs = [...new Set(ls.map((l) => l.uf))].sort();
  const cidades = Object.fromEntries(ufs.map((uf) => [uf, [...new Set(ls.filter((l) => l.uf === uf).map((l) => l.cidade))].sort()]));
  return { ufs, cidades };
}
