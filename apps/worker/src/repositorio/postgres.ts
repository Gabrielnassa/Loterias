import {
  chaveConcurso,
  ehModalidade,
  pagina,
  valorDasApostas,
  type BolaoRegistrado,
  type ColocacaoPorEscopo,
  type ConcursoAgendavel,
  type ConcursoRef,
  type LinhaMercado,
  type LotericaRef,
  type ModalidadeSlug,
  type OrigemT0,
  type Participacao,
  type RegraAbertura,
  type ResultadoLeitura,
} from '@radar/core';
import { schema, type Db } from '@radar/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AberturaParaSalvar, ConcursoParaSalvar, FimColeta, InicioColeta, Repositorio } from './tipos';

// Em SQL cru (sql`...`) o driver não converte Date: passar sempre ISO string + cast.
const { aberturas, aberturaParticipacoes, boloes, bolaoJogos, coletas, concursos, eventosBolao, lotericas, mercadoMinuto, modalidades, regrasAbertura, snapshotsBolao } = schema;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) r.push(itens.slice(i, i + tamanho));
  return r;
}

function colocacao(brasil: number | null, uf: number | null, cidade: number | null): ColocacaoPorEscopo | null {
  if (brasil === null || uf === null || cidade === null) return null;
  return {
    brasil: { posicao: brasil, pagina: pagina(brasil) },
    uf: { posicao: uf, pagina: pagina(uf) },
    cidade: { posicao: cidade, pagina: pagina(cidade) },
  };
}

/** Repositório PostgreSQL (Drizzle). Escritas de uma leitura numa única transação. */
export class RepositorioPostgres implements Repositorio {
  private modalidadeIds = new Map<string, number>();
  private modalidadeSlugs = new Map<number, ModalidadeSlug>();
  private concursoIds = new Map<string, number>();
  private lotericaIds = new Map<string, number>();
  private bolaoIds = new Map<string, number>();

  constructor(private readonly db: Db) {}

  private async carregarModalidades() {
    if (this.modalidadeIds.size) return;
    for (const m of await this.db.select().from(modalidades)) {
      this.modalidadeIds.set(m.slug, m.id);
      if (ehModalidade(m.slug)) this.modalidadeSlugs.set(m.id, m.slug);
    }
  }

  private async modalidadeId(slug: ModalidadeSlug): Promise<number> {
    await this.carregarModalidades();
    const id = this.modalidadeIds.get(slug);
    if (id === undefined) throw new Error(`modalidade desconhecida no banco: ${slug}`);
    return id;
  }

  private async concursoId(ref: ConcursoRef, tx: Db | Tx = this.db): Promise<number> {
    const k = chaveConcurso(ref);
    const cache = this.concursoIds.get(k);
    if (cache !== undefined) return cache;
    const modalidadeId = await this.modalidadeId(ref.modalidade);
    const [r] = await tx
      .insert(concursos)
      .values({ modalidadeId, numero: ref.concurso, origem: 'fonte' })
      .onConflictDoUpdate({ target: [concursos.modalidadeId, concursos.numero], set: { numero: sql`excluded.numero` } })
      .returning({ id: concursos.id });
    this.concursoIds.set(k, r!.id);
    return r!.id;
  }

  async concursosAgendaveis(agora: Date): Promise<ConcursoAgendavel[]> {
    await this.carregarModalidades();
    const limitePrevisao = new Date(agora.getTime() - 3 * 3_600_000);
    const linhas = await this.db
      .select({
        id: concursos.id,
        modalidadeId: concursos.modalidadeId,
        numero: concursos.numero,
        abreEm: concursos.abreEm,
        abreEmOrigem: concursos.abreEmOrigem,
        fechaEm: concursos.fechaEm,
        processadaEm: aberturas.processadaEm,
      })
      .from(concursos)
      .leftJoin(aberturas, eq(aberturas.concursoId, concursos.id))
      .where(
        and(
          sql`${concursos.encerradoEm} is null`,
          sql`(${concursos.origem} <> 'previsao' or ${concursos.abreEm} > ${limitePrevisao.toISOString()}::timestamptz)`,
        ),
      );
    const r: ConcursoAgendavel[] = [];
    for (const l of linhas) {
      const modalidade = this.modalidadeSlugs.get(l.modalidadeId);
      if (!modalidade) continue;
      this.concursoIds.set(chaveConcurso({ modalidade, concurso: l.numero }), l.id);
      r.push({ modalidade, concurso: l.numero, abreEm: l.abreEm, abreEmOrigem: l.abreEmOrigem, fechaEm: l.fechaEm, aberturaProcessada: l.processadaEm !== null });
    }
    return r;
  }

  async salvarConcursos(cs: readonly ConcursoParaSalvar[]): Promise<void> {
    for (const c of cs) {
      const modalidadeId = await this.modalidadeId(c.modalidade);
      const [r] = await this.db
        .insert(concursos)
        .values({
          modalidadeId,
          numero: c.concurso,
          dataSorteio: c.dataSorteio ?? null,
          sorteioEm: c.sorteioEm ?? null,
          abreEm: c.abreEm ?? null,
          abreEmPrevisto: c.abreEm ?? null,
          abreEmOrigem: c.abreEmOrigem ?? (c.origem === 'manual' ? 'manual' : 'regra'),
          abreEmRegra: c.abreEmRegra ?? null,
          fechaEm: c.fechaEm ?? null,
          premioEstimado: c.premioEstimado !== undefined ? String(c.premioEstimado) : null,
          acumulado: c.acumulado ?? null,
          especial: c.especial ?? false,
          origem: c.origem,
        })
        .onConflictDoUpdate({
          target: [concursos.modalidadeId, concursos.numero],
          set: {
            // abre_em existente nunca é sobrescrito (pode ter ajuste manual)
            abreEm: sql`coalesce(${concursos.abreEm}, excluded.abre_em)`,
            abreEmPrevisto: sql`coalesce(${concursos.abreEmPrevisto}, excluded.abre_em_previsto)`,
            abreEmOrigem: sql`case when ${concursos.abreEm} is null then excluded.abre_em_origem else ${concursos.abreEmOrigem} end`,
            abreEmRegra: sql`case when ${concursos.abreEm} is null then excluded.abre_em_regra else ${concursos.abreEmRegra} end`,
            sorteioEm: sql`coalesce(excluded.sorteio_em, ${concursos.sorteioEm})`,
            fechaEm: sql`coalesce(excluded.fecha_em, ${concursos.fechaEm})`,
            dataSorteio: sql`coalesce(excluded.data_sorteio, ${concursos.dataSorteio})`,
            premioEstimado: sql`coalesce(excluded.premio_estimado, ${concursos.premioEstimado})`,
            acumulado: sql`coalesce(excluded.acumulado, ${concursos.acumulado})`,
            especial: sql`${concursos.especial} or excluded.especial`,
            origem: sql`case when excluded.origem = 'fonte' then 'fonte' else ${concursos.origem} end`,
          },
        })
        .returning({ id: concursos.id });
      this.concursoIds.set(chaveConcurso(c), r!.id);
    }
  }

  async carregarEstado(ref: ConcursoRef): Promise<BolaoRegistrado[]> {
    const concursoId = await this.concursoId(ref);
    const linhas = await this.db
      .select({ b: boloes, l: lotericas })
      .from(boloes)
      .innerJoin(lotericas, eq(lotericas.id, boloes.lotericaId))
      .where(eq(boloes.concursoId, concursoId));
    return linhas.map(({ b, l }) => {
      this.bolaoIds.set(b.idCaixa, b.id);
      this.lotericaIds.set(l.codigoCaixa, l.id);
      const loterica: LotericaRef = { codigoCaixa: l.codigoCaixa, nome: l.nome, cidade: l.cidade, uf: l.uf, ...(l.bairro ? { bairro: l.bairro } : {}) };
      const reg: BolaoRegistrado = {
        idCaixa: b.idCaixa,
        loterica,
        modalidade: ref.modalidade,
        concurso: ref.concurso,
        jogos: b.jogos,
        dezenas: b.dezenas,
        cotasTotal: b.cotasTotal,
        valorCotaBase: Number(b.valorCota),
        firstSeenAt: b.firstSeenAt,
        lastSeenAt: b.lastSeenAt,
        fila: b.fila,
        filaCalculada: b.filaCalculada,
        filaObservada: b.filaObservada,
        filaObservadaEntrada: b.filaObservadaEntrada,
        ordemPrimeiraLeitura: b.ordemPrimeiraLeitura ?? 0,
        cotasDisponiveis: b.cotasDisponiveis,
        status: b.status,
        esgotouEm: b.esgotouEm,
        ausencias: 0,
        primeiraAusenciaEm: null,
        posEntradaObservada: colocacao(b.posEntradaBrasil, b.posEntradaUf, b.posEntradaCidade),
        posEntradaCalculada: colocacao(b.posEntradaCalcBrasil, b.posEntradaCalcUf, b.posEntradaCalcCidade)!,
        empateEntrada: b.empateEntrada,
        sobraFinal: b.sobraFinal,
        estornado: b.estornado,
      };
      if (b.valorCotaExibido !== null) reg.valorCotaExibido = Number(b.valorCotaExibido);
      if (b.cotasDigitais !== null) reg.cotasDigitais = b.cotasDigitais;
      if (b.contemResiduo) reg.contemResiduo = true;
      if (b.valorUltimaCota !== null) reg.valorUltimaCotaBase = Number(b.valorUltimaCota);
      if (b.tarifaCota !== null) reg.tarifaPorCotaFonte = Number(b.tarifaCota);
      return reg;
    });
  }

  async iniciarColeta(c: InicioColeta): Promise<number> {
    const [r] = await this.db
      .insert(coletas)
      .values({
        tipo: c.tipo,
        modo: c.modo,
        modalidade: c.modalidade ?? null,
        concurso: c.concurso ?? null,
        slot: c.slot ?? null,
        agendadaPara: c.agendadaPara ?? null,
        iniciouEm: c.iniciouEm,
      })
      .returning({ id: coletas.id });
    return r!.id;
  }

  async finalizarColeta(id: number, fim: FimColeta): Promise<void> {
    await this.db
      .update(coletas)
      .set({
        terminouEm: fim.terminouEm,
        itens: fim.itens ?? null,
        paginas: fim.paginas ?? null,
        completa: fim.completa ?? null,
        novos: fim.novos ?? null,
        eventos: fim.eventos ?? null,
        erro: fim.erro ?? null,
        desvioServidorMs: fim.desvioServidorMs ?? null,
        estrategia: fim.estrategia ?? null,
      })
      .where(eq(coletas.id, id));
  }

  private async garantirLotericas(tx: Tx, ls: readonly LotericaRef[]): Promise<void> {
    const faltando = [...new Map(ls.filter((l) => !this.lotericaIds.has(l.codigoCaixa)).map((l) => [l.codigoCaixa, l])).values()];
    for (const lote of emLotes(faltando, 1000)) {
      const r = await tx
        .insert(lotericas)
        .values(lote.map((l) => ({ codigoCaixa: l.codigoCaixa, nome: l.nome, cidade: l.cidade, uf: l.uf, bairro: l.bairro ?? null })))
        .onConflictDoUpdate({
          target: lotericas.codigoCaixa,
          set: {
            nome: sql`excluded.nome`,
            cidade: sql`excluded.cidade`,
            uf: sql`excluded.uf`,
            bairro: sql`coalesce(excluded.bairro, ${lotericas.bairro})`,
            atualizadoEm: sql`now()`,
          },
        })
        .returning({ id: lotericas.id, codigo: lotericas.codigoCaixa });
      for (const x of r) this.lotericaIds.set(x.codigo, x.id);
    }
  }

  private async idsDosBoloes(tx: Tx, idsCaixa: readonly string[]): Promise<void> {
    const faltando = idsCaixa.filter((id) => !this.bolaoIds.has(id));
    for (const lote of emLotes(faltando, 5000)) {
      const r = await tx.select({ id: boloes.id, idCaixa: boloes.idCaixa }).from(boloes).where(inArray(boloes.idCaixa, lote));
      for (const x of r) this.bolaoIds.set(x.idCaixa, x.id);
    }
  }

  async salvarLeitura(ref: ConcursoRef, r: ResultadoLeitura, coletaId: number, vistoEm: Date): Promise<void> {
    const concursoId = await this.concursoId(ref);
    const novosCache: string[] = [];
    try {
      await this.db.transaction(async (tx) => {
        // 1) lotéricas e bolões novos
        await this.garantirLotericas(tx, r.novos.map((b) => b.loterica));
        for (const lote of emLotes(r.novos, 1000)) {
          const ins = await tx
            .insert(boloes)
            .values(
              lote.map((b) => ({
                idCaixa: b.idCaixa,
                lotericaId: this.lotericaIds.get(b.loterica.codigoCaixa)!,
                concursoId,
                jogos: b.jogos,
                dezenas: b.dezenas,
                cotasTotal: b.cotasTotal,
                valorCota: b.valorCotaBase.toFixed(2),
                valorCotaExibido: b.valorCotaExibido !== undefined ? b.valorCotaExibido.toFixed(2) : null,
                valorAposta: valorDasApostas(b).toFixed(2),
                cotasDigitais: b.cotasDigitais ?? null,
                contemResiduo: b.contemResiduo ?? false,
                valorUltimaCota: b.valorUltimaCotaBase !== undefined ? b.valorUltimaCotaBase.toFixed(2) : null,
                tarifaCota: b.tarifaPorCotaFonte !== undefined ? b.tarifaPorCotaFonte.toFixed(2) : null,
                cotasDisponiveis: b.cotasDisponiveis,
                firstSeenAt: b.firstSeenAt,
                lastSeenAt: b.lastSeenAt,
                fila: b.fila,
                filaCalculada: b.filaCalculada,
                filaObservada: b.filaObservada,
                filaObservadaEntrada: b.filaObservadaEntrada,
                ordemPrimeiraLeitura: b.ordemPrimeiraLeitura,
                posEntradaBrasil: b.posEntradaObservada?.brasil.posicao ?? null,
                posEntradaUf: b.posEntradaObservada?.uf.posicao ?? null,
                posEntradaCidade: b.posEntradaObservada?.cidade.posicao ?? null,
                posEntradaCalcBrasil: b.posEntradaCalculada.brasil.posicao,
                posEntradaCalcUf: b.posEntradaCalculada.uf.posicao,
                posEntradaCalcCidade: b.posEntradaCalculada.cidade.posicao,
                empateEntrada: b.empateEntrada,
                status: b.status,
                esgotouEm: b.esgotouEm,
              })),
            )
            .onConflictDoNothing({ target: boloes.idCaixa })
            .returning({ id: boloes.id, idCaixa: boloes.idCaixa });
          for (const x of ins) {
            this.bolaoIds.set(x.idCaixa, x.id);
            novosCache.push(x.idCaixa);
          }
        }
        const jogos = r.novos.flatMap((b) =>
          (b.numeros ?? []).map((numeros, ordem) => ({ bolaoId: this.bolaoIds.get(b.idCaixa)!, ordem, numeros })),
        );
        for (const lote of emLotes(jogos, 2000)) await tx.insert(bolaoJogos).values(lote).onConflictDoNothing();

        // 2) alterações de estado (disponíveis, status, esgotou_em, sobra, estorno)
        await this.idsDosBoloes(tx, [...r.alterados.map((b) => b.idCaixa), ...r.vistos, ...r.linhas.map((l) => l.idCaixa), ...r.eventos.map((e) => e.idCaixa)]);
        for (const lote of emLotes(r.alterados, 2000)) {
          const valores = sql.join(
            lote.map(
              (b) =>
                sql`(${this.bolaoIds.get(b.idCaixa)!}::bigint, ${b.cotasDisponiveis}::int, ${b.status}::text, ${b.esgotouEm?.toISOString() ?? null}::timestamptz, ${b.sobraFinal}::int, ${b.estornado}::boolean, ${b.fila}::int, ${b.filaObservada}::int)`,
            ),
            sql`, `,
          );
          await tx.execute(sql`
            update boloes as b set
              cotas_disponiveis = v.disp, status = v.status, esgotou_em = v.esgotou_em,
              sobra_final = v.sobra, estornado = v.estornado, fila = v.fila, fila_observada = v.fila_obs
            from (values ${valores}) as v(id, disp, status, esgotou_em, sobra, estornado, fila, fila_obs)
            where b.id = v.id`);
        }

        // 3) last_seen_at de todos os vistos
        const vistosIds = r.vistos.map((id) => this.bolaoIds.get(id)).filter((x): x is number => x !== undefined);
        for (const lote of emLotes(vistosIds, 10000)) {
          await tx.update(boloes).set({ lastSeenAt: vistoEm }).where(inArray(boloes.id, lote));
        }

        // 4) snapshots e eventos
        const linhas = r.linhas
          .filter((l) => this.bolaoIds.has(l.idCaixa))
          .map((l) => ({
            coletadoEm: l.coletadoEm,
            bolaoId: this.bolaoIds.get(l.idCaixa)!,
            cotasDisponiveis: l.cotasDisponiveis,
            presente: l.presente,
            posicaoBrasil: l.posicao?.brasil.posicao ?? null,
            posicaoUf: l.posicao?.uf.posicao ?? null,
            posicaoCidade: l.posicao?.cidade.posicao ?? null,
            coletaId,
          }));
        for (const lote of emLotes(linhas, 5000)) await tx.insert(snapshotsBolao).values(lote).onConflictDoNothing();
        const eventos = r.eventos
          .filter((e) => this.bolaoIds.has(e.idCaixa))
          .map((e) => ({ bolaoId: this.bolaoIds.get(e.idCaixa)!, tipo: e.tipo, em: e.em, quantidade: e.quantidade, inferido: e.inferido ?? false, coletaId }));
        for (const lote of emLotes(eventos, 5000)) await tx.insert(eventosBolao).values(lote);
      });
    } catch (e) {
      // transação desfeita: ids de bolões novos no cache não existem no banco
      for (const id of novosCache) this.bolaoIds.delete(id);
      throw e;
    }
  }

  async salvarMercado(ref: ConcursoRef, minuto: Date, linhas: readonly LinhaMercado[]): Promise<void> {
    if (!linhas.length) return;
    const concursoId = await this.concursoId(ref);
    const modalidadeId = await this.modalidadeId(ref.modalidade);
    await this.db
      .insert(mercadoMinuto)
      .values(
        linhas.map((l) => ({
          concursoId,
          modalidadeId,
          uf: l.uf,
          minuto,
          boloes: l.boloes,
          cotas: l.cotasDisponiveis,
          lotericas: l.lotericas,
          valor: l.valorAVenda.toFixed(2),
        })),
      )
      .onConflictDoUpdate({
        target: [mercadoMinuto.concursoId, mercadoMinuto.uf, mercadoMinuto.minuto],
        set: { boloes: sql`excluded.boloes`, cotas: sql`excluded.cotas`, lotericas: sql`excluded.lotericas`, valor: sql`excluded.valor` },
      });
  }

  async salvarAbertura(ref: ConcursoRef, a: AberturaParaSalvar, participacoes: readonly Participacao[]): Promise<void> {
    const concursoId = await this.concursoId(ref);
    await this.db.transaction(async (tx) => {
      const [ab] = await tx
        .insert(aberturas)
        .values({ concursoId, t0: a.t0, janelaMin: a.janelaMin, participacaoMin: a.participacaoMin, processadaEm: a.processadaEm, escopoColocacao: a.escopoColocacao })
        .onConflictDoUpdate({
          target: aberturas.concursoId,
          set: { t0: a.t0, janelaMin: a.janelaMin, participacaoMin: a.participacaoMin, processadaEm: a.processadaEm, escopoColocacao: a.escopoColocacao },
        })
        .returning({ id: aberturas.id });
      await tx.delete(aberturaParticipacoes).where(eq(aberturaParticipacoes.aberturaId, ab!.id));
      if (!participacoes.length) return;
      await this.garantirLotericas(tx, participacoes.map((p) => p.loterica));
      await this.idsDosBoloes(tx, participacoes.map((p) => p.primeiroBolaoId));
      for (const lote of emLotes(participacoes, 2000)) {
        await tx.insert(aberturaParticipacoes).values(
          lote.map((p) => ({
            aberturaId: ab!.id,
            lotericaId: this.lotericaIds.get(p.loterica.codigoCaixa)!,
            primeiroBolaoId: this.bolaoIds.get(p.primeiroBolaoId)!,
            primeiroEm: p.primeiroEm,
            atrasoS: p.atrasoS.toFixed(3),
            nBoloes1h: p.nBoloes1h,
            posCidade: p.posCidade,
            posUf: p.posUf,
            posBrasil: p.posBrasil,
            paginaCidade: p.paginaCidade,
            paginaUf: p.paginaUf,
            paginaBrasil: p.paginaBrasil,
            valor1h: p.valor1h.toFixed(2),
            pctVendido: p.pctVendido.toFixed(5),
            sobra: p.sobra === null ? null : p.sobra.toFixed(2),
            empate: p.empate,
          })),
        );
      }
    });
  }

  async regrasAbertura(): Promise<RegraAbertura[]> {
    await this.carregarModalidades();
    const linhas = await this.db.select().from(regrasAbertura);
    return linhas.map((r) => {
      const h = r.horaPadrao ? /^(\d{2}):(\d{2})/.exec(r.horaPadrao) : null;
      return {
        id: r.chave,
        modalidade: r.modalidadeId !== null ? (this.modalidadeSlugs.get(r.modalidadeId) ?? null) : null,
        diaSemana: r.diaSemana,
        minutosAposSorteio: r.minutosAposSorteio,
        horaPadrao: h ? { hora: Number(h[1]), minuto: Number(h[2]) } : null,
        prioridade: r.prioridade,
        ativo: r.ativo,
        ...(r.observacao ? { observacao: r.observacao } : {}),
      };
    });
  }

  async ajustarAbreEm(ref: ConcursoRef, abreEm: Date, origem: OrigemT0): Promise<void> {
    const concursoId = await this.concursoId(ref);
    await this.db
      .update(concursos)
      .set({ abreEmPrevisto: sql`coalesce(${concursos.abreEmPrevisto}, ${concursos.abreEm})`, abreEm, abreEmOrigem: origem })
      .where(and(eq(concursos.id, concursoId), sql`${concursos.abreEmOrigem} <> 'manual'`));
  }

  async marcarEncerrado(ref: ConcursoRef, em: Date): Promise<void> {
    const concursoId = await this.concursoId(ref);
    await this.db.update(concursos).set({ encerradoEm: em }).where(eq(concursos.id, concursoId));
  }
}
