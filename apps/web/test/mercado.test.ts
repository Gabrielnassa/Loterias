import ExcelJS from 'exceljs';
import { horarioSP, retratoMercado } from '@radar/core';
import { criarDb, criarSql, migrar, recriarBancoDeTeste, type Sql } from '@radar/db';
import { semearHistoricoSimulado } from '@radar/db/seed';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as getMercado } from '../app/api/mercado/route';
import { GET as getSerie } from '../app/api/mercado/serie/route';
import { GET as getFilas } from '../app/api/mercado/filas/route';
import { GET as getLoterias } from '../app/api/estatisticas/loterias/route';
import { GET as getTop } from '../app/api/estatisticas/lotericas/route';
import { GET as getFicha } from '../app/api/estatisticas/lotericas/[codigo]/route';
import { GET as getVirada } from '../app/api/mega-da-virada/route';
import { FonteSimuladaRaioX } from '../lib/dados';
import { FontePostgresRaioX } from '../lib/dados-postgres';
import { definirFonteDeDados } from '../lib/fonte-dados';
import { abasDoConcurso, fichaDaLoterica, filasDoConcurso, fonteMercado, lerInstante, monitoramento, painelMegaDaVirada, panoramaLoterias, topDoPeriodo } from '../lib/mercado';

/** Fase 4 (Mercado) sobre a fonte simulada e, com DATABASE_URL_TESTE, sobre o banco com o seed. */
const AGORA = horarioSP(2026, 11, 20, 23, 30); // sexta, 1h45 depois da abertura das 21:45
const fonte = new FonteSimuladaRaioX(() => AGORA, 60 * 60_000, { semanas: 3, nLotericas: 200 });
const req = (caminho: string) => new Request(`http://teste.local${caminho}`);
const ctx = <T>(p: T) => ({ params: Promise.resolve(p) });

beforeAll(() => definirFonteDeDados(fonte));
afterAll(() => definirFonteDeDados(undefined));

describe('Mercado na fonte simulada', () => {
  it('Monitoramento: um cartão por concurso à venda, filtro por UF e Retrato de um instante passado', async () => {
    const m = await monitoramento(fonte);
    expect(m.retrato).toBe(false);
    expect(m.cartoes.map((c) => c.concurso.modalidade).sort()).toEqual(['lotofacil', 'quina']);
    for (const c of m.cartoes) {
      expect(c.retrato.boloes).toBeGreaterThan(20);
      expect(c.retrato.paginas).toBe(Math.ceil(c.retrato.boloes / 30));
    }
    const sp = await monitoramento(fonte, { filtro: { uf: 'SP' } });
    expect(sp.cartoes[0]!.retrato.boloes).toBeLessThan(m.cartoes[0]!.retrato.boloes);
    const antes = await monitoramento(fonte, { em: lerInstante('2026-11-20T22:00') });
    expect(antes.retrato).toBe(true);
    const mesmo = antes.cartoes.find((c) => c.concurso.chave === m.cartoes[0]!.concurso.chave)!;
    expect(mesmo.retrato.inseridos).toBeLessThanOrEqual(m.cartoes[0]!.retrato.inseridos);
    // instante futuro vira "agora"
    expect((await monitoramento(fonte, { em: new Date(AGORA.getTime() + 3_600_000) })).retrato).toBe(false);
  });
  it('abas: minuto a minuto (última hora), hora a hora desde a abertura e páginas por fila', async () => {
    const c = (await monitoramento(fonte)).cartoes[0]!;
    const d = (await abasDoConcurso(fonte, c.concurso.chave, { em: AGORA, aba: 'minuto' }))!;
    expect(d.porMinuto.length).toBeGreaterThan(50);
    expect(d.porMinuto.at(-1)!.boloes).toBe(c.retrato.boloes);
    expect(d.porHora[0]!.t.getTime()).toBeGreaterThan(c.concurso.abreEm.getTime());
    expect(d.porHora.reduce((s, p) => s + p.novos, 0)).toBe(c.retrato.inseridos);
    expect(d.filas.porFila[0]!.paginaDe).toBe(1);
  });
  it('Filas por região e Estatísticas (panorama, top 10, ficha) e Mega da Virada', async () => {
    const chave = (await fonteMercado(fonte).concursosAVenda(AGORA))[0]!.chave;
    const f = (await filasDoConcurso(fonte, chave, { filtro: { uf: 'SP', cidade: 'Sao Paulo' } }))!;
    expect(f.resumo.boloes).toBeGreaterThan(0);
    expect(f.cidades.SP).toContain('São Paulo');
    const p = await panoramaLoterias(fonte);
    expect(p.linhas.at(-1)!.modalidade).toBe('total');
    const top = await topDoPeriodo(fonte, { dias: 30 });
    expect(top.linhas).toHaveLength(10);
    const ficha = (await fichaDaLoterica(fonte, top.linhas[0]!.loterica.codigoCaixa, { dias: 30 }))!;
    expect(ficha.boloes).toBe(top.linhas[0]!.boloes);
    const v = (await painelMegaDaVirada(fonte))!;
    expect(v.concurso.especial).toBe(true);
    expect(v.retrato.boloes).toBeGreaterThan(100);
    expect(v.porDia.reduce((s, x) => s + x.novos, 0)).toBe(v.retrato.inseridos);
  });
  it('APIs em JSON, CSV e Excel', async () => {
    const j = await (await getMercado(req('/api/mercado?uf=SP'))).json();
    expect(j.dados.cartoes.length).toBe(2);
    expect(j.aviso).toMatch(/Estimativas/);
    const chave = j.dados.cartoes[0].concurso.chave as string;
    const csv = await (await getSerie(req(`/api/mercado/serie?concurso=${chave}&aba=hora&formato=csv`))).text();
    expect(csv.split('\r\n')[0]).toContain('Bolões à venda;Cotas à venda');
    const x = await getFilas(req(`/api/mercado/filas?concurso=${chave}&formato=xlsx`));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await x.arrayBuffer());
    expect(wb.getWorksheet('Filas')!.rowCount).toBeGreaterThan(2);
    expect((await getLoterias(req('/api/estatisticas/loterias?formato=csv'))).headers.get('content-type')).toContain('text/csv');
    const top = await (await getTop(req('/api/estatisticas/lotericas?criterio=boloes'))).json();
    const codigo = top.dados.linhas[0].loterica.codigoCaixa as string;
    expect((await getFicha(req(`/api/estatisticas/lotericas/${codigo}`), ctx({ codigo }))).status).toBe(200);
    expect((await getFicha(req('/api/estatisticas/lotericas/123'), ctx({ codigo: '123' }))).status).toBe(404);
    expect((await getVirada(req('/api/mega-da-virada'))).status).toBe(200);
    expect((await getSerie(req('/api/mercado/serie'))).status).toBe(400);
  });
});

const URL = process.env.DATABASE_URL_TESTE;
const suite = URL ? describe : describe.skip;

suite('Mercado no Postgres (seed)', () => {
  let sql: Sql;
  let pg: FontePostgresRaioX;
  const ATE = horarioSP(2026, 11, 21, 12, 0);
  beforeAll(async () => {
    sql = criarSql(await recriarBancoDeTeste(URL!, 'radar_teste_mercado'), { max: 4 });
    await migrar(sql, () => {});
    await semearHistoricoSimulado(criarDb(sql), { ate: ATE, semanas: 2, nLotericas: 120 });
    pg = new FontePostgresRaioX(sql, () => ATE);
  }, 120_000);
  afterAll(async () => {
    await sql?.end();
  });

  it('lê concursos, bolões e histórico do banco com as mesmas regras', async () => {
    const m = fonteMercado(pg);
    // o seed só tem concursos já encerrados ou na janela de 3 h depois do fechamento
    const ultimo = await sql<{ slug: string; numero: number; fecha_em: Date }[]>`
      select m.slug, c.numero, c.fecha_em from concursos c join modalidades m on m.id = c.modalidade_id order by c.abre_em desc limit 1`;
    const chave = `${ultimo[0]!.slug}-${ultimo[0]!.numero}`;
    const c = (await m.concurso(chave))!;
    expect(c.modalidade).toBe(ultimo[0]!.slug);
    const boloes = await m.boloes(chave, ATE);
    const { n } = (await sql<{ n: number }[]>`select count(*)::int as n from boloes b join concursos c on c.id = b.concurso_id join modalidades m on m.id = c.modalidade_id where m.slug = ${ultimo[0]!.slug} and c.numero = ${ultimo[0]!.numero}`)[0]!;
    expect(boloes).toHaveLength(n);
    const r = retratoMercado(boloes, new Date(c.abreEm.getTime() + 30 * 60_000), { fechaEm: c.fechaEm });
    expect(r.inseridos).toBeGreaterThan(0);
    const hist = await m.historico(new Date(ATE.getTime() - 14 * 86_400_000), ATE);
    expect(hist.length).toBeGreaterThan(100);
    const top = await topDoPeriodo(pg, { dias: 14 });
    const ficha = (await fichaDaLoterica(pg, top.linhas[0]!.loterica.codigoCaixa, { dias: 14 }))!;
    expect(ficha.boloes).toBe(top.linhas[0]!.boloes);
    expect(await m.megaDaVirada(ATE)).toBeNull(); // o seed não tem concurso especial
  });
});

describe('previsão de fechamento na web (simulada)', () => {
  it('prevê o concurso em andamento com backtest, e a API responde', async () => {
    const { previsaoDoConcurso } = await import('../lib/mercado');
    const { GET } = await import('../app/api/mercado/previsao/route');
    const chave = (await fonteMercado(fonte).concursosAVenda(AGORA))[0]!.chave;
    const d = (await previsaoDoConcurso(fonte, chave))!;
    expect(d.previsao).not.toBeNull();
    expect(d.previsao!.cotasSobra.min).toBeLessThanOrEqual(d.previsao!.cotasSobra.max);
    expect(d.backtest!.n).toBeGreaterThan(5);
    expect(d.backtest!.itens.every((i) => i.abreEm.getTime() < d.concurso.abreEm.getTime())).toBe(true);
    const j = await (await GET(req(`/api/mercado/previsao?concurso=${chave}`))).json();
    expect(j.dados.previsao.parecidos.length).toBeGreaterThan(2);
  });
});

describe('Sugestões (simulada)', () => {
  it('franquia de amanhã para a loja de demonstração, otimizador e API', async () => {
    const { sugestoesParaLoja } = await import('../lib/sugestoes');
    const { GET } = await import('../app/api/minha/sugestoes/route');
    const d = await sugestoesParaLoja(fonte, { limite: 8000 });
    expect(d.dia).toBe('2026-11-21');
    expect(d.franquia.usado).toBeLessThanOrEqual(8000);
    expect(d.franquia.linhas.length).toBeGreaterThan(0);
    expect(d.otimizador[0]!.opcoes.length).toBeGreaterThan(0);
    const csv = await (await GET(req('/api/minha/sugestoes?formato=csv'))).text();
    expect(csv.split('\r\n')[0]).toContain('Loteria;Sugerido (R$);Formato');
  });
});

describe('Simulador de posição e Cronômetro (simulada)', () => {
  it('página prevista para a hora de entrada, limite da pág. 1 e próxima abertura', async () => {
    const { simuladorDePosicao, cronometro, atrasoDaHora, horaDoAtraso } = await import('../lib/abertura-ferramentas');
    const { GET } = await import('../app/api/minha/simulador/route');
    expect(atrasoDaHora('21:45:30', 5)).toBe(30);
    expect(atrasoDaHora('11:46', 7)).toBe(60);
    expect(horaDoAtraso(90, 5)).toBe('21:46:30');
    const cedo = await simuladorDePosicao(fonte, { hora: '21:45:05', diaSemana: 5 });
    const tarde = await simuladorDePosicao(fonte, { hora: '21:55:00', diaSemana: 5 });
    expect(cedo.porEscopo[1]!.aberturas).toBeGreaterThan(0);
    expect(tarde.porEscopo[2]!.posicaoMediana!).toBeGreaterThanOrEqual(cedo.porEscopo[2]!.posicaoMediana!);
    const c = await cronometro(fonte);
    expect(c.proxima.t0.toISOString()).toBe(horarioSP(2026, 11, 21, 21, 45).toISOString()); // 20/11 23:30 -> sábado 21:45
    expect(c.placar.linhas.length).toBeGreaterThanOrEqual(0);
    const j = await (await GET(req('/api/minha/simulador?hora=21:45:30&dia=5'))).json();
    expect(j.dados.porEscopo).toHaveLength(3);
  });
});
