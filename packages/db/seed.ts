import { fileURLToPath } from 'node:url';
import { gerarHistoricoSimulado } from '@radar/core/simulacao';
import { sql } from 'drizzle-orm';
import { criarDb, criarSql, type Db } from './cliente';
import { migrar } from './migrar';
import * as schema from './schema';

/**
 * SEED de demonstração: grava no banco o histórico SIMULADO (lotéricas fictícias, aberturas,
 * bolões da janela e participações) gerado pelas mesmas regras do coletor. Tudo fica marcado com
 * `concursos.origem = 'seed'`; enquanto houver dados do seed a web mostra o aviso de dados simulados.
 *
 *   DATABASE_URL=... pnpm db:seed              (13 semanas, 800 lotéricas)
 *   DATABASE_URL=... pnpm db:seed --limpar     (só apaga o que veio do seed)
 * Nunca rodar num banco com dados reais do coletor sem antes conferir: o seed não mexe em concursos
 * de outra origem, mas grava lotéricas fictícias (códigos 98xxxx).
 */
export interface OpcoesSeed {
  ate?: Date;
  semanas?: number;
  nLotericas?: number;
  semente?: number;
  log?: (msg: string) => void;
}

function emLotes<T>(itens: readonly T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < itens.length; i += n) r.push(itens.slice(i, i + n));
  return r;
}

/** Apaga só o que veio do seed (concursos com origem 'seed' e o que depende deles). */
export async function limparSeed(db: Db): Promise<void> {
  await db.execute(sql`
    with c as (select id from concursos where origem = 'seed')
    , a as (delete from aberturas where concurso_id in (select id from c) returning id)
    select count(*) from a`);
  await db.execute(sql`delete from eventos_bolao where bolao_id in (select b.id from boloes b join concursos c on c.id = b.concurso_id where c.origem = 'seed')`);
  await db.execute(sql`delete from bolao_jogos where bolao_id in (select b.id from boloes b join concursos c on c.id = b.concurso_id where c.origem = 'seed')`);
  await db.execute(sql`delete from boloes where concurso_id in (select id from concursos where origem = 'seed')`);
  await db.execute(sql`delete from mercado_minuto where concurso_id in (select id from concursos where origem = 'seed')`);
  await db.execute(sql`delete from concursos where origem = 'seed'`);
}

export async function semearHistoricoSimulado(db: Db, o: OpcoesSeed = {}) {
  const log = o.log ?? (() => {});
  const ate = o.ate ?? new Date();
  const h = gerarHistoricoSimulado({ ate, semanas: o.semanas ?? 13, nLotericas: o.nLotericas ?? 800, semente: o.semente ?? 2026 });
  log(`histórico simulado: ${h.lotericas.length} lotéricas, ${h.aberturas.length} aberturas, ${h.participacoes.length} participações`);
  await limparSeed(db);

  const modalidades = new Map((await db.select().from(schema.modalidades)).map((m) => [m.slug, m.id]));
  const lotericaId = new Map<string, number>();
  for (const lote of emLotes(h.lotericas, 1000)) {
    const r = await db
      .insert(schema.lotericas)
      .values(lote.map((l) => ({ codigoCaixa: l.codigoCaixa, nome: l.nome, cidade: l.cidade, uf: l.uf, bairro: l.bairro ?? null })))
      .onConflictDoUpdate({ target: schema.lotericas.codigoCaixa, set: { nome: sql`excluded.nome`, cidade: sql`excluded.cidade`, uf: sql`excluded.uf`, bairro: sql`excluded.bairro` } })
      .returning({ id: schema.lotericas.id, codigo: schema.lotericas.codigoCaixa });
    for (const x of r) lotericaId.set(x.codigo, x.id);
  }

  let nBoloes = 0;
  let nPart = 0;
  for (const plano of h.aberturas) {
    const fechaEm = h.fechaEm(plano.id)!;
    const [c] = await db
      .insert(schema.concursos)
      .values({
        modalidadeId: modalidades.get(plano.modalidade)!,
        numero: plano.concurso,
        abreEm: plano.t0,
        abreEmPrevisto: plano.t0,
        abreEmOrigem: 'regra',
        fechaEm,
        sorteioEm: new Date(fechaEm.getTime() + 3_600_000),
        encerradoEm: fechaEm.getTime() <= ate.getTime() ? fechaEm : null,
        origem: 'seed',
      })
      .onConflictDoNothing()
      .returning({ id: schema.concursos.id });
    if (!c) continue; // já existe um concurso real com esse número: não mexe
    const boloes = h.detalhar(plano.id) ?? [];
    const bolaoId = new Map<string, number>();
    for (const lote of emLotes(boloes, 1000)) {
      const r = await db
        .insert(schema.boloes)
        .values(
          lote.map((b) => {
            const pos = b.posEntrada;
            const encerrado = b.sobraFinal !== null && b.sobraFinal !== undefined;
            return {
              idCaixa: `${plano.modalidade}:${b.id}`,
              lotericaId: lotericaId.get(b.loterica.codigoCaixa)!,
              concursoId: c.id,
              jogos: b.jogos,
              dezenas: b.dezenas,
              cotasTotal: b.cotasTotal,
              valorCota: b.valorCotaBase.toFixed(2),
              valorAposta: (b.cotasTotal * b.valorCotaBase).toFixed(2),
              cotasDisponiveis: b.cotasDisponiveis,
              cotasDigitais: b.cotasTotal,
              firstSeenAt: b.firstSeenAt,
              lastSeenAt: encerrado ? fechaEm : ate,
              fila: b.fila,
              filaCalculada: b.fila,
              filaObservada: b.fila,
              filaObservadaEntrada: b.fila,
              ordemPrimeiraLeitura: pos.brasil.posicao,
              posEntradaBrasil: pos.brasil.posicao,
              posEntradaUf: pos.uf.posicao,
              posEntradaCidade: pos.cidade.posicao,
              posEntradaCalcBrasil: pos.brasil.posicao,
              posEntradaCalcUf: pos.uf.posicao,
              posEntradaCalcCidade: pos.cidade.posicao,
              empateEntrada: b.empate ?? false,
              status: (encerrado ? 'encerrado' : b.esgotouEm ? 'esgotado' : 'a_venda') as 'encerrado' | 'esgotado' | 'a_venda',
              esgotouEm: b.esgotouEm,
              sobraFinal: encerrado ? b.sobraFinal! : null,
            };
          }),
        )
        .onConflictDoNothing()
        .returning({ id: schema.boloes.id, idCaixa: schema.boloes.idCaixa });
      for (const x of r) bolaoId.set(x.idCaixa, x.id);
      nBoloes += r.length;
    }
    const [ab] = await db
      .insert(schema.aberturas)
      .values({ concursoId: c.id, t0: plano.t0, processadaEm: new Date(plano.t0.getTime() + 3_600_000), escopoColocacao: 'vitrine' })
      .returning({ id: schema.aberturas.id });
    const parts = h.participacoes.filter((p) => p.aberturaId === plano.id);
    for (const lote of emLotes(parts, 1000)) {
      await db.insert(schema.aberturaParticipacoes).values(
        lote.map((p) => ({
          aberturaId: ab!.id,
          lotericaId: lotericaId.get(p.lotericaCodigo)!,
          primeiroBolaoId: bolaoId.get(`${plano.modalidade}:${p.primeiroBolaoId}`)!,
          primeiroEm: p.primeiroEm,
          atrasoS: p.atrasoS.toFixed(3),
          nBoloes1h: p.nBoloes1h,
          posCidade: p.posCidade,
          posUf: p.posUf,
          posBrasil: p.posBrasil,
          paginaCidade: Math.ceil(p.posCidade / 30),
          paginaUf: Math.ceil(p.posUf / 30),
          paginaBrasil: Math.ceil(p.posBrasil / 30),
          valor1h: p.valor1h.toFixed(2),
          pctVendido: p.pctVendido === null || p.pctVendido === undefined ? null : p.pctVendido.toFixed(5),
          sobra: p.sobra === null || p.sobra === undefined ? null : p.sobra.toFixed(2),
          empate: p.empate ?? false,
        })),
      );
      nPart += lote.length;
    }
  }
  log(`seed gravado: ${nBoloes} bolões, ${nPart} participações`);
  return { lotericas: h.lotericas.length, aberturas: h.aberturas.length, boloes: nBoloes, participacoes: nPart, historico: h };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('defina DATABASE_URL');
    process.exit(1);
  }
  const conexao = criarSql(url, { max: 2 });
  const db = criarDb(conexao);
  (async () => {
    await migrar(conexao, console.log);
    if (process.argv.includes('--limpar')) {
      await limparSeed(db);
      console.log('dados do seed removidos');
    } else {
      const t = Date.now();
      const r = await semearHistoricoSimulado(db, { log: console.log });
      console.log(`pronto em ${((Date.now() - t) / 1000).toFixed(1)} s: ${r.aberturas} aberturas, ${r.boloes} bolões, ${r.participacoes} participações`);
    }
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => conexao.end());
}
