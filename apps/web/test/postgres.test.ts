import { horarioSP } from '@radar/core';
import { criarDb, criarSql, migrar, recriarBancoDeTeste, type Sql } from '@radar/db';
import { semearHistoricoSimulado } from '@radar/db/seed';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FonteSimuladaRaioX } from '../lib/dados';
import { fonteDeTeste, FontePostgresRaioX } from '../lib/dados-postgres';
import { aoVivo, detalheAbertura, fichaAberturas, rankingDaAbertura, rankingPeriodo } from '../lib/servico';

/**
 * A web lendo do PostgreSQL (seed do histórico simulado) tem de dar o MESMO resultado que lendo da
 * simulação em memória. Roda só com DATABASE_URL_TESTE (cria/apaga o banco radar_teste_web).
 */
describe('aviso "dados simulados" pela FONTE do coletor', () => {
  it('simulada e fixture são fontes de teste; caixa-* e vazio (não informado) não', () => {
    expect(fonteDeTeste('simulada')).toBe(true);
    expect(fonteDeTeste('fixture')).toBe(true);
    expect(fonteDeTeste('caixa-navegador')).toBe(false);
    expect(fonteDeTeste('caixa-links')).toBe(false);
    expect(fonteDeTeste('')).toBe(false);
    expect(fonteDeTeste(undefined)).toBe(false);
  });
});

const URL = process.env.DATABASE_URL_TESTE;
const suite = URL ? describe : describe.skip;
const ATE = horarioSP(2026, 11, 21, 12, 0);
const OPCOES = { semanas: 3, nLotericas: 150 };

suite('web lendo do Postgres', () => {
  let sql: Sql;
  let pg: FontePostgresRaioX;
  const sim = new FonteSimuladaRaioX(() => ATE, 60 * 60_000, OPCOES);

  beforeAll(async () => {
    sql = criarSql(await recriarBancoDeTeste(URL!, 'radar_teste_web'), { max: 4 });
    await migrar(sql, () => {});
    await semearHistoricoSimulado(criarDb(sql), { ate: ATE, ...OPCOES });
    pg = new FontePostgresRaioX(sql, () => ATE);
  }, 120_000);
  afterAll(async () => {
    await sql?.end();
  });

  it('marca os dados como simulados (origem = seed) e acha a lotérica de demonstração', async () => {
    expect(await pg.simulado()).toBe(true);
    expect((await pg.minhaLoterica())?.codigoCaixa).toBe('980011');
    expect((await pg.lotericas()).length).toBe(150);
    expect((await pg.buscar('trevo de ouro sao paulo'))[0]?.codigoCaixa).toBe('980011');
  });

  it('aberturas e participações iguais às da simulação', async () => {
    const [a1, a2] = [await pg.aberturas(), await sim.aberturas()];
    expect(a1.map((a) => [a.id, a.t0.toISOString()])).toEqual(a2.map((a) => [a.id, a.t0.toISOString()]));
    const chave = (p: { aberturaId: string; lotericaCodigo: string; atrasoS: number; posUf: number; posBrasil: number; nBoloes1h: number }) =>
      `${p.aberturaId}|${p.lotericaCodigo}|${p.atrasoS.toFixed(3)}|${p.posUf}|${p.posBrasil}|${p.nBoloes1h}`;
    expect((await pg.participacoes()).map(chave).sort()).toEqual((await sim.participacoes()).map(chave).sort());
  });

  it('tela 1 (grade e resumo) idêntica', async () => {
    const [f1, f2] = [await fichaAberturas(pg, '980011', { semanas: 3 }), await fichaAberturas(sim, '980011', { semanas: 3 })];
    expect(f1!.resumo).toEqual(f2!.resumo);
    expect(JSON.stringify(f1!.grade)).toBe(JSON.stringify(f2!.grade));
  });

  it('tela 2 (detalhe) e ranking da abertura idênticos', async () => {
    const id = (await pg.aberturas()).at(-1)!.id;
    const [d1, d2] = [await detalheAbertura(pg, id), await detalheAbertura(sim, id)];
    expect(d1!.linhas.length).toBe(d2!.linhas.length);
    const resumo = (l: NonNullable<typeof d1>['linhas'][number]) => [l.loterica.codigoCaixa, l.entradaEm.toISOString(), l.colocacao.uf.posicao, l.situacao, l.cotasVendidas];
    expect(d1!.linhas.map(resumo)).toEqual(d2!.linhas.map(resumo));
    expect(d1!.colocacaoDisponivel).toBe(true);
    const [r1, r2] = [await rankingDaAbertura(pg, id, { uf: 'SP' }), await rankingDaAbertura(sim, id, { uf: 'SP' })];
    expect(r1!.linhas.map((l) => l.loterica.codigoCaixa)).toEqual(r2!.linhas.map((l) => l.loterica.codigoCaixa));
  });

  it('tela 4 (ranking do período) idêntica', async () => {
    const [r1, r2] = [await rankingPeriodo(pg, { uf: 'SP', semanas: 2 }), await rankingPeriodo(sim, { uf: 'SP', semanas: 2 })];
    expect(r1.linhas.map((l) => [l.loterica.codigoCaixa, l.participacoes])).toEqual(r2.linhas.map((l) => [l.loterica.codigoCaixa, l.participacoes]));
  });

  it('tela 5: sem abertura em andamento no banco, com o seed usa a demonstração simulada', async () => {
    const av = await aoVivo(pg, { uf: 'SP' });
    expect(av.emAndamento).toBe(true);
    expect(Array.isArray(av.linhas)).toBe(true);
  });
});
