import { ABERTURA_JANELA_MIN, ABERTURA_PARTICIPACAO_MIN } from '../dominio/constantes';
import type { ColocacaoPorEscopo, LotericaRef } from '../dominio/tipos';
import type { BolaoRegistrado } from '../eventos/estado';
import { compararChegada } from '../regras/fila';
import { centavos } from '../util/estatistica';

/**
 * Participação na abertura (SPEC, Raio-X — Definições):
 *  Abertura      janela de T0 até T0 + 60 min.
 *  Participou    ao menos 1 bolão com first_seen_at em [T0, T0 + 30 min] (configurável).
 *  Entrada       first_seen_at do 1º bolão; atraso = segundos desde T0.
 *  Colocação     posição desse 1º bolão NO MOMENTO EM QUE ENTROU, nos 3 escopos, com a página.
 *  1ª hora       n_boloes_1h e valor_1h contam bolões com first_seen_at em [T0, T0 + janela].
 */
export interface JanelaAbertura {
  t0: Date;
  janelaMin?: number;
  participacaoMin?: number;
}

export interface BolaoDaAbertura {
  id: string;
  loterica: LotericaRef;
  firstSeenAt: Date;
  ordemFonte?: number;
  fila: number;
  cotasTotal: number;
  valorCotaBase: number;
  /** Disponíveis agora (ou no fechamento). */
  cotasDisponiveis: number;
  /** Sobra final em cotas, quando o concurso já encerrou. */
  sobraFinal?: number | null;
  estornado?: boolean;
  /** Colocação na entrada a usar (observada se houver, senão calculada). */
  posEntrada: ColocacaoPorEscopo;
  empate?: boolean;
}

export interface Participacao {
  loterica: LotericaRef;
  primeiroBolaoId: string;
  primeiroEm: Date;
  /** Segundos desde T0 (com milissegundos). */
  atrasoS: number;
  posCidade: number;
  posUf: number;
  posBrasil: number;
  paginaCidade: number;
  paginaUf: number;
  paginaBrasil: number;
  nBoloes1h: number;
  cotas1h: number;
  valor1h: number;
  /** Fração de cotas vendidas dos bolões da 1ª hora (0..1). */
  pctVendido: number;
  /** Sobra em R$ (valor base) dos bolões da 1ª hora; null enquanto o concurso não encerrou. */
  sobra: number | null;
  /** O 1º bolão entrou na mesma leitura que outros: ordem entre eles veio da fonte. */
  empate: boolean;
}

export function limitesJanela(j: JanelaAbertura) {
  const t0 = j.t0.getTime();
  return {
    inicio: t0,
    fimParticipacao: t0 + (j.participacaoMin ?? ABERTURA_PARTICIPACAO_MIN) * 60_000,
    fimJanela: t0 + (j.janelaMin ?? ABERTURA_JANELA_MIN) * 60_000,
  };
}

/** Converte um bolão do estado do coletor para o formato da abertura. */
export function bolaoDaAbertura(b: BolaoRegistrado): BolaoDaAbertura {
  return {
    id: b.idCaixa,
    loterica: b.loterica,
    firstSeenAt: b.firstSeenAt,
    ordemFonte: b.ordemPrimeiraLeitura,
    fila: b.fila,
    cotasTotal: b.cotasTotal,
    valorCotaBase: b.valorCotaBase,
    cotasDisponiveis: b.cotasDisponiveis,
    sobraFinal: b.sobraFinal,
    estornado: b.estornado,
    posEntrada: b.posEntradaObservada ?? b.posEntradaCalculada,
    empate: b.empateEntrada,
  };
}

export function calcularParticipacoes(janela: JanelaAbertura, boloes: readonly BolaoDaAbertura[]): Participacao[] {
  const { inicio, fimParticipacao, fimJanela } = limitesJanela(janela);
  const porLoterica = new Map<string, BolaoDaAbertura[]>();
  for (const b of boloes) {
    if (b.estornado) continue;
    const t = b.firstSeenAt.getTime();
    if (t < inicio || t > fimJanela) continue;
    const cod = b.loterica.codigoCaixa;
    const lista = porLoterica.get(cod);
    if (lista) lista.push(b);
    else porLoterica.set(cod, [b]);
  }

  const res: Participacao[] = [];
  for (const lista of porLoterica.values()) {
    lista.sort((a, b) => compararChegada({ ...a, lotericaCodigo: '' }, { ...b, lotericaCodigo: '' }));
    const primeiro = lista[0]!;
    if (primeiro.firstSeenAt.getTime() > fimParticipacao) continue;

    const cotas1h = lista.reduce((s, b) => s + b.cotasTotal, 0);
    const vendidas = lista.reduce((s, b) => s + (b.cotasTotal - (b.sobraFinal ?? b.cotasDisponiveis)), 0);
    const encerrado = lista.every((b) => b.sobraFinal !== null && b.sobraFinal !== undefined);
    const p = primeiro.posEntrada;
    res.push({
      loterica: primeiro.loterica,
      primeiroBolaoId: primeiro.id,
      primeiroEm: primeiro.firstSeenAt,
      atrasoS: (primeiro.firstSeenAt.getTime() - inicio) / 1000,
      posCidade: p.cidade.posicao,
      posUf: p.uf.posicao,
      posBrasil: p.brasil.posicao,
      paginaCidade: p.cidade.pagina,
      paginaUf: p.uf.pagina,
      paginaBrasil: p.brasil.pagina,
      nBoloes1h: lista.length,
      cotas1h,
      valor1h: centavos(lista.reduce((s, b) => s + b.cotasTotal * b.valorCotaBase, 0)),
      pctVendido: cotas1h > 0 ? vendidas / cotas1h : 0,
      sobra: encerrado ? centavos(lista.reduce((s, b) => s + (b.sobraFinal ?? 0) * b.valorCotaBase, 0)) : null,
      empate: primeiro.empate ?? false,
    });
  }
  return res.sort((a, b) => a.primeiroEm.getTime() - b.primeiroEm.getTime() || a.posBrasil - b.posBrasil);
}

/** Ordem de chegada numa abertura, filtrada por UF/cidade ("Ao vivo" e ranking da abertura). */
export function ordemDeChegada(
  participacoes: readonly Participacao[],
  filtro: { uf?: string; cidade?: string } = {},
): (Participacao & { ordem: number })[] {
  return participacoes
    .filter((p) => (!filtro.uf || p.loterica.uf === filtro.uf) && (!filtro.cidade || p.loterica.cidade === filtro.cidade))
    .slice()
    .sort((a, b) => a.primeiroEm.getTime() - b.primeiroEm.getTime() || a.posBrasil - b.posBrasil)
    .map((p, i) => ({ ...p, ordem: i + 1 }));
}

