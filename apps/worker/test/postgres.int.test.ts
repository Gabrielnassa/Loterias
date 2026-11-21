import { horarioSP } from '@radar/core';
import { FonteSimulada, gerarAberturaSimulada } from '@radar/core/simulacao';
import { criarDb, criarSql, migrar, recriarBancoDeTeste, type Sql } from '@radar/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Agendador } from '../src/agendador';
import { Coletor } from '../src/coletor';
import { criarFilaMemoria } from '../src/filas';
import { logMudo } from '../src/log';
import { RelogioManual } from '../src/relogio';
import { RepositorioPostgres } from '../src/repositorio/postgres';

/**
 * Pipeline completo gravando no PostgreSQL. Roda só com DATABASE_URL_TESTE; cria/APAGA o banco
 * radar_teste_worker no mesmo servidor:
 *   DATABASE_URL_TESTE=postgres://postgres@localhost:5432/postgres pnpm --filter @radar/worker test
 */
const URL = process.env.DATABASE_URL_TESTE;
const suite = URL ? describe : describe.skip;
/** Primeira linha de uma consulta de contagem. */
const um = async (q: PromiseLike<readonly unknown[]>) => (await q)[0] as Record<string, number>;
// T0 relativo a hoje para cair nas partições diárias criadas pela migração
const hoje = new Date();
const T0 = horarioSP(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, hoje.getUTCDate(), 12, 0);

suite('repositório PostgreSQL', () => {
  let sql: Sql;
  const sim = gerarAberturaSimulada({ semente: 77, t0: T0, nBoloes: 200, concurso: 3500, fechaEm: new Date(T0.getTime() + 30 * 60_000) });

  beforeAll(async () => {
    sql = criarSql(await recriarBancoDeTeste(URL!, 'radar_teste_worker'), { max: 4 });
    await migrar(sql, () => {});
  });
  afterAll(async () => {
    await sql?.end();
  });

  const montar = (relogio: RelogioManual) => {
    const repo = new RepositorioPostgres(criarDb(sql));
    const coletor = new Coletor({ fonte: new FonteSimulada([sim], () => relogio.agora()), repo, relogio, log: logMudo });
    const fila = criarFilaMemoria(coletor, logMudo, 2);
    const agendador = new Agendador({ repo, relogio, log: logMudo, despachar: (t) => fila.despachar(t), ocupado: (t) => fila.ocupado(t), recarregarConcursosMs: 1000 });
    const rodarAte = async (ate: number) => {
      while (relogio.agora().getTime() <= ate) {
        await agendador.tick();
        await fila.ociosa();
        relogio.avancar(1000);
      }
    };
    return { repo, rodarAte };
  };

  it('grava bolões, eventos, snapshots, coletas e mercado dos primeiros 10 min', async () => {
    const relogio = new RelogioManual(T0.getTime() - 90_000);
    const { repo, rodarAte } = montar(relogio);
    await repo.salvarConcursos([{ modalidade: 'lotofacil', concurso: 3500, abreEm: T0, fechaEm: sim.fechaEm, origem: 'manual' }]);
    await rodarAte(T0.getTime() + 10 * 60_000);

    const { boloes, lotericas } = await um(sql`select (select count(*)::int from boloes) as boloes, (select count(*)::int from lotericas) as lotericas`);
    expect(boloes).toBeGreaterThan(80);
    expect(lotericas).toBeGreaterThan(20);
    const { novos } = await um(sql`select count(*)::int as novos from eventos_bolao where tipo = 'bolao_novo'`);
    expect(novos).toBe(boloes);
    const { erros, abertura } = await um(sql`select count(*) filter (where erro is not null)::int as erros,
      count(*) filter (where modo = 'abertura' and tipo = 'varredura')::int as abertura from coletas`);
    expect(erros).toBe(0);
    expect(abertura).toBe(12 + 120 + 1); // T0−60 s .. T0+10 min, a cada 5 s
    // colocação observada = calculada (fonte devolve a ordem da vitrine)
    const { divergentes } = await um(sql`select count(*)::int as divergentes from boloes
      where pos_entrada_brasil <> pos_entrada_calc_brasil or pos_entrada_uf <> pos_entrada_calc_uf or pos_entrada_cidade <> pos_entrada_calc_cidade`);
    expect(divergentes).toBe(0);
    // snapshots caíram na partição do dia, não na default
    const { naDefault } = await um(sql`select count(*)::int as "naDefault" from snapshots_bolao_default`);
    expect(naDefault).toBe(0);
    const { mercado } = await um(sql`select count(*)::int as mercado from mercado_minuto where uf = 'BR'`);
    expect(mercado).toBeGreaterThan(5);
    // a mesma consulta-base do Raio-X roda sobre o schema (participações vêm na Fase 2)
    await sql`select l.nome, date_trunc('week', a.t0 at time zone 'America/Sao_Paulo') as semana, count(*)
      from abertura_participacoes p join aberturas a on a.id = p.abertura_id join lotericas l on l.id = p.loterica_id
      group by 1, 2`;
  });

  it('reinício do worker: recarrega o estado do banco e continua sem duplicar nem renumerar filas', async () => {
    const relogio = new RelogioManual(T0.getTime() + 10 * 60_000 + 5000);
    const { rodarAte } = montar(relogio); // caches vazios, como num processo novo
    await rodarAte(T0.getTime() + 20 * 60_000);
    const { duplicados } = await um(sql`select count(*)::int as duplicados from (
      select id_caixa from boloes group by id_caixa having count(*) > 1) x`);
    expect(duplicados).toBe(0);
    const filas = await sql<{ id_caixa: string; fila: number }[]>`select id_caixa, fila from boloes`;
    const verdade = new Map(sim.boloes.map((b) => [b.bolao.idCaixa, b.fila]));
    for (const f of filas) expect(f.fila, f.id_caixa).toBe(verdade.get(f.id_caixa));
  });

  it('encerramento grava sobra_final e encerrado_em', async () => {
    const relogio = new RelogioManual(sim.fechaEm.getTime() - 2000);
    const { rodarAte } = montar(relogio);
    await rodarAte(sim.fechaEm.getTime() + 3000);
    const { semSobra } = await um(sql`select count(*)::int as "semSobra" from boloes where sobra_final is null or status <> 'encerrado'`);
    expect(semSobra).toBe(0);
    const [c] = await sql`select encerrado_em from concursos where numero = 3500`;
    expect(c!.encerrado_em).not.toBeNull();
    const { encerrou } = await um(sql`select count(*)::int as encerrou from eventos_bolao where tipo = 'encerrou'`);
    const { boloes } = await um(sql`select count(*)::int as boloes from boloes`);
    expect(encerrou).toBe(boloes);
  });
});
