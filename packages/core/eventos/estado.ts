import { BOLOES_POR_PAGINA } from '../dominio/constantes';
import type { JogoBolao } from '../dominio/jogo';
import type { ModalidadeSlug } from '../dominio/modalidades';
import type { ColocacaoPorEscopo, ConcursoRef, LotericaRef } from '../dominio/tipos';
import type { ItemLeitura, LeituraVitrine } from '../fonte/varredura';
import { calcularPosicoes, posicoesObservadas, type BolaoNaVitrine } from '../regras/posicao';

/**
 * Estado de um concurso no coletor e geração de EVENTOS a partir de pares de snapshots
 * (SPEC, Motor de dados). Puro: o worker carrega/persiste, aqui só se decide.
 *
 *  bolao_novo  id visto pela 1ª vez: grava first_seen_at, posição observada e fila
 *  venda       disponíveis diminuíram
 *  devolucao   disponíveis AUMENTARAM (ex.: reserva de carrinho expirou). Não previsto na SPEC;
 *              registrado para não perder informação e não distorcer a venda.
 *  esgotou     disponíveis = 0, ou sumiu da vitrine antes do fechamento
 *  encerrou    concurso fechou; sobra = disponíveis no último snapshot antes do fechamento
 *  estorno     marcado/desmarcado pelo usuário (manual)
 */
export type TipoEvento = 'bolao_novo' | 'venda' | 'devolucao' | 'esgotou' | 'encerrou' | 'estorno';

export interface EventoBolao {
  idCaixa: string;
  tipo: TipoEvento;
  em: Date;
  quantidade: number;
  /** true quando deduzido (ex.: sumiu da vitrine => assumimos vendido). */
  inferido?: boolean;
}

export type StatusBolao = 'a_venda' | 'esgotado' | 'encerrado' | 'estornado';

export interface BolaoRegistrado {
  idCaixa: string;
  loterica: LotericaRef;
  modalidade: ModalidadeSlug;
  concurso: number;
  jogos: number;
  dezenas: number;
  cotasTotal: number;
  valorCotaBase: number;
  valorCotaExibido?: number;
  numeros?: number[][];
  jogosDetalhe?: JogoBolao[];
  /** Cotas oferecidas na internet (o restante do total fica no balcão), se a fonte informar. */
  cotasDigitais?: number;
  contemResiduo?: boolean;
  valorUltimaCotaBase?: number;
  tarifaPorCotaFonte?: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  /** Fila EFETIVA (usada nas colocações): a observada na fonte, se vier; senão a calculada. */
  fila: number;
  /** Fila pela regra (ordem de first_seen_at entre os bolões da lotérica). Sempre preenchida. */
  filaCalculada: number;
  /** Fila informada pela fonte (campo `index`) na leitura mais recente; null se a fonte não informa. */
  filaObservada: number | null;
  /** Fila informada pela fonte quando o bolão apareceu (comparar com a atual revela fila dinâmica). */
  filaObservadaEntrada: number | null;
  /** Posição observada na leitura em que apareceu (desempate da ordem de chegada). */
  ordemPrimeiraLeitura: number;
  cotasDisponiveis: number;
  status: StatusBolao;
  esgotouEm: Date | null;
  /** Leituras completas seguidas em que não apareceu. */
  ausencias: number;
  primeiraAusenciaEm: Date | null;
  /** Colocação na entrada observada na ordem da fonte (se a fonte devolve a ordem da vitrine). */
  posEntradaObservada: ColocacaoPorEscopo | null;
  /** Colocação na entrada calculada pela regra (fila, first_seen_at). Sempre preenchida. */
  posEntradaCalculada: ColocacaoPorEscopo;
  /** Entrou na mesma leitura que outros bolões novos: ordem entre eles veio da fonte. */
  empateEntrada: boolean;
  sobraFinal: number | null;
  estornado: boolean;
}

export interface EstadoConcurso extends ConcursoRef {
  boloes: Map<string, BolaoRegistrado>;
  /** Quantos bolões cada lotérica já tem no concurso (para atribuir a próxima fila). */
  boloesPorLoterica: Map<string, number>;
  ultimaLeituraEm: Date | null;
  /** Última leitura COMPLETA em que o concurso estava vazio (base do ajuste do T0). */
  ultimaLeituraVaziaEm: Date | null;
  encerradoEm: Date | null;
}

export function novoEstadoConcurso(ref: ConcursoRef, boloes: readonly BolaoRegistrado[] = []): EstadoConcurso {
  const estado: EstadoConcurso = {
    modalidade: ref.modalidade,
    concurso: ref.concurso,
    boloes: new Map(),
    boloesPorLoterica: new Map(),
    ultimaLeituraEm: null,
    ultimaLeituraVaziaEm: null,
    encerradoEm: null,
  };
  for (const b of boloes) {
    estado.boloes.set(b.idCaixa, b);
    const cod = b.loterica.codigoCaixa;
    estado.boloesPorLoterica.set(cod, Math.max(estado.boloesPorLoterica.get(cod) ?? 0, b.filaCalculada));
  }
  return estado;
}

/** Linha para snapshots_bolao. */
export interface LinhaSnapshot {
  idCaixa: string;
  coletadoEm: Date;
  cotasDisponiveis: number;
  presente: boolean;
  posicao: ColocacaoPorEscopo | null;
}

export interface ResultadoLeitura {
  eventos: EventoBolao[];
  novos: BolaoRegistrado[];
  /** Bolões já conhecidos cujo estado mudou (disponíveis, status) — além de last_seen_at. */
  alterados: BolaoRegistrado[];
  /** Todos os bolões vistos nesta leitura (para atualizar last_seen_at). */
  vistos: string[];
  linhas: LinhaSnapshot[];
}

export interface OpcoesAplicacao {
  /** Leituras COMPLETAS seguidas sem o bolão para concluir que ele sumiu (default 2). */
  leiturasParaSumico?: number;
  /** Grava linha de snapshot de todos os vistos (keyframe) ou só de quem mudou. */
  keyframe?: boolean;
  porPagina?: number;
}

function paraVitrine(b: BolaoRegistrado): BolaoNaVitrine {
  return {
    id: b.idCaixa,
    lotericaCodigo: b.loterica.codigoCaixa,
    loterica: b.loterica,
    fila: b.fila,
    firstSeenAt: b.firstSeenAt,
    ordemFonte: b.ordemPrimeiraLeitura,
    saiuEm: b.status === 'a_venda' ? null : (b.esgotouEm ?? b.firstSeenAt),
  };
}

function registrar(item: ItemLeitura, filaCalculada: number, empate: boolean): BolaoRegistrado {
  const firstSeenAt = item.inseridoEmFonte ?? item.vistoEm;
  const filaObservada = item.filaFonte ?? null;
  const b: BolaoRegistrado = {
    idCaixa: item.idCaixa,
    loterica: item.loterica,
    modalidade: item.modalidade,
    concurso: item.concurso,
    jogos: item.jogos,
    dezenas: item.dezenas,
    cotasTotal: item.cotasTotal,
    valorCotaBase: item.valorCotaBase,
    firstSeenAt,
    lastSeenAt: item.vistoEm,
    fila: filaObservada ?? filaCalculada,
    filaCalculada,
    filaObservada,
    filaObservadaEntrada: filaObservada,
    ordemPrimeiraLeitura: item.posicaoObservada,
    cotasDisponiveis: item.cotasDisponiveis,
    status: item.cotasDisponiveis === 0 ? 'esgotado' : 'a_venda',
    esgotouEm: item.cotasDisponiveis === 0 ? item.vistoEm : null,
    ausencias: 0,
    primeiraAusenciaEm: null,
    posEntradaObservada: null,
    posEntradaCalculada: null as unknown as ColocacaoPorEscopo, // preenchida logo abaixo
    empateEntrada: empate,
    sobraFinal: null,
    estornado: false,
  };
  if (item.valorCotaExibido !== undefined) b.valorCotaExibido = item.valorCotaExibido;
  if (item.numeros) b.numeros = item.numeros;
  if (item.jogosDetalhe) b.jogosDetalhe = item.jogosDetalhe;
  if (item.cotasDigitais !== undefined) b.cotasDigitais = item.cotasDigitais;
  if (item.contemResiduo) b.contemResiduo = true;
  if (item.valorUltimaCotaBase !== undefined) b.valorUltimaCotaBase = item.valorUltimaCotaBase;
  if (item.tarifaPorCotaFonte !== undefined) b.tarifaPorCotaFonte = item.tarifaPorCotaFonte;
  return b;
}

/**
 * Aplica uma leitura da vitrine ao estado do concurso (muta `estado`) e devolve eventos,
 * bolões novos/alterados e linhas de snapshot.
 */
export function aplicarLeitura(
  estado: EstadoConcurso,
  leitura: LeituraVitrine,
  opcoes: OpcoesAplicacao = {},
): ResultadoLeitura {
  const leiturasParaSumico = opcoes.leiturasParaSumico ?? 2;
  const porPagina = opcoes.porPagina ?? BOLOES_POR_PAGINA;
  const res: ResultadoLeitura = { eventos: [], novos: [], alterados: [], vistos: [], linhas: [] };
  if (estado.encerradoEm) return res;
  if (leitura.modalidade !== estado.modalidade || leitura.concurso !== estado.concurso) {
    throw new Error(`leitura de ${leitura.modalidade} ${leitura.concurso} aplicada ao estado de ${estado.modalidade} ${estado.concurso}`);
  }

  const observadas = leitura.ordemDaVitrine
    ? posicoesObservadas(
        leitura.itens.map((it) => ({ id: it.idCaixa, loterica: it.loterica, posicaoObservada: it.posicaoObservada })),
        porPagina,
      )
    : null;
  const itensOrdenados = [...leitura.itens].sort((a, b) => a.posicaoObservada - b.posicaoObservada);
  const novosItens = itensOrdenados.filter((it) => !estado.boloes.has(it.idCaixa));
  const empate = novosItens.length > 1;
  const alterados = new Set<string>();

  // 1) bolões novos: fila na ordem da fonte (dentro da mesma lotérica = ordem de chegada)
  for (const it of novosItens) {
    const cod = it.loterica.codigoCaixa;
    const fila = (estado.boloesPorLoterica.get(cod) ?? 0) + 1;
    estado.boloesPorLoterica.set(cod, fila);
    const b = registrar(it, fila, empate);
    b.posEntradaObservada = observadas?.get(it.idCaixa) ?? null;
    estado.boloes.set(b.idCaixa, b);
    res.novos.push(b);
    res.eventos.push({ idCaixa: b.idCaixa, tipo: 'bolao_novo', em: b.firstSeenAt, quantidade: b.cotasTotal });
    if (b.status === 'esgotado') {
      res.eventos.push({ idCaixa: b.idCaixa, tipo: 'esgotou', em: it.vistoEm, quantidade: 0 });
    }
  }

  // 2) bolões já conhecidos que apareceram
  const novosIds = new Set(res.novos.map((b) => b.idCaixa));
  const vistosAgora = new Set<string>();
  for (const it of itensOrdenados) {
    vistosAgora.add(it.idCaixa);
    res.vistos.push(it.idCaixa);
    const b = estado.boloes.get(it.idCaixa)!;
    if (novosIds.has(b.idCaixa)) continue;
    b.lastSeenAt = it.vistoEm;
    b.ausencias = 0;
    b.primeiraAusenciaEm = null;
    if (it.filaFonte !== undefined && it.filaFonte !== b.filaObservada) {
      // a fonte mudou a fila do bolão (fila dinâmica?): acompanha a observada, mantém a calculada
      b.filaObservada = it.filaFonte;
      b.fila = it.filaFonte;
      alterados.add(b.idCaixa);
    }
    if (b.status === 'estornado' || b.status === 'encerrado') continue;
    const antes = b.cotasDisponiveis;
    const agora = it.cotasDisponiveis;
    if (agora < antes) {
      res.eventos.push({ idCaixa: b.idCaixa, tipo: 'venda', em: it.vistoEm, quantidade: antes - agora });
    } else if (agora > antes) {
      res.eventos.push({ idCaixa: b.idCaixa, tipo: 'devolucao', em: it.vistoEm, quantidade: agora - antes });
    }
    if (agora !== antes) {
      b.cotasDisponiveis = agora;
      alterados.add(b.idCaixa);
    }
    if (agora === 0 && b.status === 'a_venda') {
      b.status = 'esgotado';
      b.esgotouEm = it.vistoEm;
      res.eventos.push({ idCaixa: b.idCaixa, tipo: 'esgotou', em: it.vistoEm, quantidade: 0 });
      alterados.add(b.idCaixa);
    } else if (agora > 0 && b.status === 'esgotado') {
      // reapareceu com cotas (ex.: sumiço era falso)
      b.status = 'a_venda';
      b.esgotouEm = null;
      alterados.add(b.idCaixa);
    }
  }

  // 3) quem sumiu: só em leitura COMPLETA, e só após N leituras completas seguidas
  const linhasSumico: LinhaSnapshot[] = [];
  if (leitura.completa) {
    for (const b of estado.boloes.values()) {
      if (vistosAgora.has(b.idCaixa) || b.status !== 'a_venda') continue;
      b.ausencias++;
      if (b.ausencias === 1) b.primeiraAusenciaEm = leitura.iniciouEm;
      if (b.ausencias >= leiturasParaSumico) {
        const em = b.primeiraAusenciaEm ?? leitura.iniciouEm;
        if (b.cotasDisponiveis > 0) {
          res.eventos.push({ idCaixa: b.idCaixa, tipo: 'venda', em, quantidade: b.cotasDisponiveis, inferido: true });
        }
        res.eventos.push({ idCaixa: b.idCaixa, tipo: 'esgotou', em, quantidade: 0, inferido: true });
        b.cotasDisponiveis = 0;
        b.status = 'esgotado';
        b.esgotouEm = em;
        alterados.add(b.idCaixa);
        linhasSumico.push({ idCaixa: b.idCaixa, coletadoEm: em, cotasDisponiveis: 0, presente: false, posicao: null });
      }
    }
  }

  // 4) colocações: calculadas pela regra sobre os visíveis; observadas quando a fonte dá a ordem.
  //    Leitura completa: visíveis = exatamente o que a vitrine mostrou. Parcial: os vistos + os
  //    que estavam à venda e podem estar nas páginas não lidas.
  const visiveis = [...estado.boloes.values()].filter(
    (b) => vistosAgora.has(b.idCaixa) || (!leitura.completa && b.status === 'a_venda'),
  );
  const calculadas = calcularPosicoes(
    visiveis.map((b) => ({ ...paraVitrine(b), saiuEm: null })),
    undefined,
    porPagina,
  );
  for (const b of res.novos) b.posEntradaCalculada = calculadas.get(b.idCaixa)!;

  // 5) linhas de snapshot: novos, alterados, sumidos; todos os vistos se for keyframe
  for (const it of itensOrdenados) {
    const deveGravar = opcoes.keyframe || alterados.has(it.idCaixa) || novosIds.has(it.idCaixa);
    if (!deveGravar) continue;
    res.linhas.push({
      idCaixa: it.idCaixa,
      coletadoEm: it.vistoEm,
      cotasDisponiveis: it.cotasDisponiveis,
      presente: true,
      posicao: observadas?.get(it.idCaixa) ?? calculadas.get(it.idCaixa) ?? null,
    });
  }
  res.linhas.push(...linhasSumico);

  res.alterados = [...alterados].filter((id) => !novosIds.has(id)).map((id) => estado.boloes.get(id)!);
  estado.ultimaLeituraEm = leitura.iniciouEm;
  if (leitura.completa && leitura.itens.length === 0) estado.ultimaLeituraVaziaEm = leitura.iniciouEm;
  return res;
}

/**
 * Encerramento do concurso: sobra = disponíveis no último snapshot antes do fechamento.
 * Gera `encerrou` para todos os bolões (quantidade = sobra; 0 para esgotados).
 */
export function encerrarConcurso(estado: EstadoConcurso, em: Date): ResultadoLeitura {
  const res: ResultadoLeitura = { eventos: [], novos: [], alterados: [], vistos: [], linhas: [] };
  if (estado.encerradoEm) return res;
  for (const b of estado.boloes.values()) {
    if (b.status === 'estornado') continue;
    const sobra = b.status === 'esgotado' ? 0 : b.cotasDisponiveis;
    b.sobraFinal = sobra;
    b.status = 'encerrado';
    res.eventos.push({ idCaixa: b.idCaixa, tipo: 'encerrou', em, quantidade: sobra });
    res.alterados.push(b);
  }
  estado.encerradoEm = em;
  return res;
}

/** Estorno manual (marcar/desmarcar). Bolão estornado não entra no financeiro. */
export function marcarEstorno(estado: EstadoConcurso, idCaixa: string, em: Date, estornado: boolean): EventoBolao | null {
  const b = estado.boloes.get(idCaixa);
  if (!b || b.estornado === estornado) return null;
  b.estornado = estornado;
  if (estornado) b.status = 'estornado';
  else b.status = estado.encerradoEm ? 'encerrado' : b.cotasDisponiveis === 0 ? 'esgotado' : 'a_venda';
  return { idCaixa, tipo: 'estorno', em, quantidade: estornado ? 1 : -1 };
}
