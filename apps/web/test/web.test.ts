import ExcelJS from 'exceljs';
import { horarioSP, pagina } from '@radar/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { GET as getAberturasLoterica } from '../app/api/lotericas/[codigo]/aberturas/route';
import { GET as getBusca } from '../app/api/lotericas/route';
import { GET as getDetalhe } from '../app/api/aberturas/[id]/route';
import { GET as getRankingAbertura } from '../app/api/aberturas/[id]/ranking/route';
import { GET as getAoVivo } from '../app/api/aberturas/ao-vivo/route';
import { GET as getRanking } from '../app/api/ranking/route';
import { GET as getComparar } from '../app/api/comparar/route';
import { definirFonteDeDados, FonteSimuladaRaioX } from '../lib/dados';
import { paraCsv } from '../lib/exportar';
import { aoVivo, compararGrade, detalheAbertura, fichaAberturas, rankingPeriodo } from '../lib/servico';

const AGORA = horarioSP(2026, 11, 21, 12, 0); // sábado
const fonte = new FonteSimuladaRaioX(() => AGORA);
const req = (caminho: string, init?: RequestInit) => new Request(`http://teste.local${caminho}`, init);
const ctx = <T>(p: T) => ({ params: Promise.resolve(p) });

let minha: string;
let ultimaAbertura: string;

beforeAll(async () => {
  definirFonteDeDados(fonte);
  minha = (await fonte.minhaLoterica())!.codigoCaixa;
  ultimaAbertura = (await fonte.aberturas()).sort((a, b) => b.t0.getTime() - a.t0.getTime())[0]!.id;
});

describe('casos de uso das telas', () => {
  it('tela 1: ficha com grade de 12 semanas x 7 dias, resumo, tendência e chance de amanhã', async () => {
    const f = (await fichaAberturas(fonte, minha, { semanas: 12, escopo: 'uf' }))!;
    expect(f.grade).toHaveLength(12);
    expect(f.grade.every((l) => l.celulas.length === 7)).toBe(true);
    expect(f.resumo.participacoes).toBeGreaterThan(30);
    expect(f.resumo.participacoes).toBe(f.metricas.reduce((s, m) => s + m.participacoes, 0));
    expect(f.chanceAmanha.dia).toBe('2026-11-22');
    const cel = f.grade.flatMap((l) => l.celulas).find((c) => c.participou)!;
    expect(cel.pagina).toBe(pagina(cel.posicao!));
    expect(cel.aberturaId).toBeTruthy();
    expect(await fichaAberturas(fonte, '000000')).toBeNull();
  });

  it('tela 2: detalhe com todos os bolões da janela, colocação nos 3 escopos e situação', async () => {
    const d = (await detalheAbertura(fonte, ultimaAbertura))!;
    expect(d.linhas.length).toBe(d.resumo.boloes);
    expect(d.linhas.length).toBeGreaterThan(50);
    for (let i = 1; i < d.linhas.length; i++) expect(d.linhas[i]!.entradaEm.getTime()).toBeGreaterThanOrEqual(d.linhas[i - 1]!.entradaEm.getTime());
    expect(d.linhas.every((l) => l.atrasoS >= 0 && l.atrasoS <= 3600)).toBe(true);
    expect(new Set(d.linhas.map((l) => l.situacao)).size).toBeGreaterThan(1);
    const sp = (await detalheAbertura(fonte, ultimaAbertura, { uf: 'SP' }))!;
    expect(sp.linhas.every((l) => l.loterica.uf === 'SP')).toBe(true);
  });

  it('tela 3: comparar até 6 e "quem chegou primeiro" por dia', async () => {
    const r = await rankingPeriodo(fonte, { uf: 'SP', semanas: 4 });
    const codigos = [minha, ...r.linhas.slice(0, 5).map((l) => l.loterica.codigoCaixa)];
    const c = await compararGrade(fonte, codigos, { semanas: 4 });
    expect(c.lotericas.length).toBeLessThanOrEqual(6);
    for (const dia of c.dias) {
      if (!dia.primeiro) continue;
      const atrasos = Object.values(dia.porLoterica).filter((x) => x).map((x) => x!.atrasoS);
      expect(dia.porLoterica[dia.primeiro]!.atrasoS).toBe(Math.min(...atrasos));
    }
    expect(Object.values(c.vitorias).reduce((s, v) => s + v, 0)).toBe(c.dias.filter((d) => d.primeiro).length);
  });

  it('tela 4: ranking por UF e critério', async () => {
    const r = await rankingPeriodo(fonte, { uf: 'SP', semanas: 4, criterio: 'mais_rapida' });
    expect(r.linhas.every((l) => l.loterica.uf === 'SP')).toBe(true);
    for (let i = 1; i < r.linhas.length; i++) expect(r.linhas[i]!.atrasoMedianoS!).toBeGreaterThanOrEqual(r.linhas[i - 1]!.atrasoMedianoS!);
  });

  it('tela 5: ao vivo da UF com a posição destacada', async () => {
    const av = await aoVivo(fonte, { uf: 'SP', destaque: minha });
    expect(av.linhas.every((l) => l.loterica.uf === 'SP')).toBe(true);
    expect(av.linhas.map((l) => l.ordem)).toEqual(av.linhas.map((_, i) => i + 1));
    if (av.minhaPosicao !== null) expect(av.linhas[av.minhaPosicao - 1]!.destaque).toBe(true);
  });
});

describe('API', () => {
  it('GET /api/lotericas?q= busca por nome, cidade ou código', async () => {
    const r = await getBusca(req('/api/lotericas?q=trevo%20de%20ouro'));
    const j = (await r.json()) as { lotericas: { codigoCaixa: string }[] };
    expect(j.lotericas[0]!.codigoCaixa).toBe(minha);
    const porCodigo = (await (await getBusca(req(`/api/lotericas?q=${minha}`))).json()) as { lotericas: { codigoCaixa: string }[] };
    expect(porCodigo.lotericas[0]!.codigoCaixa).toBe(minha);
  });

  it('GET /api/lotericas/{codigo}/aberturas?semanas=12&modalidade=todas&escopo=uf', async () => {
    const r = await getAberturasLoterica(req(`/api/lotericas/${minha}/aberturas?semanas=12&modalidade=todas&escopo=uf`), ctx({ codigo: minha }));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { fonte: string; aviso: string; dados: { grade: unknown[]; filtro: { escopo: string } } };
    expect(j.fonte).toBe('simulada');
    expect(j.aviso).toMatch(/estimativas/i);
    expect(j.dados.grade).toHaveLength(12);
    expect((await getAberturasLoterica(req('/api/lotericas/1/aberturas'), ctx({ codigo: '1' }))).status).toBe(404);
  });

  it('GET /api/aberturas/{id}/ranking?escopo=uf&uf=SP', async () => {
    const r = await getRankingAbertura(req(`/api/aberturas/${ultimaAbertura}/ranking?escopo=uf&uf=SP`), ctx({ id: ultimaAbertura }));
    const j = (await r.json()) as { dados: { linhas: { ordem: number; loterica: { uf: string }; pagina: number; posicao: number }[] } };
    expect(j.dados.linhas.length).toBeGreaterThan(0);
    expect(j.dados.linhas.every((l) => l.loterica.uf === 'SP' && l.pagina === pagina(l.posicao))).toBe(true);
  });

  it('GET /api/aberturas/{id} em JSON, CSV e Excel', async () => {
    const csv = await getDetalhe(req(`/api/aberturas/${ultimaAbertura}?formato=csv`), ctx({ id: ultimaAbertura }));
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/);
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8 (Response.text() o remove)
    const texto = new TextDecoder().decode(bytes);
    expect(texto.split('\r\n')[0]).toMatch(/^Entrada \(hora\);Atraso \(s\);/);
    const xlsx = await getDetalhe(req(`/api/aberturas/${ultimaAbertura}?formato=xlsx`), ctx({ id: ultimaAbertura }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await xlsx.arrayBuffer());
    expect(wb.getWorksheet('Abertura')!.getRow(1).getCell(1).value).toBe('Entrada (hora)');
  });

  it('GET /api/ranking em CSV e Excel (tela 4 exporta)', async () => {
    const csv = await (await getRanking(req('/api/ranking?uf=SP&semanas=4&formato=csv'))).text();
    const linhas = csv.trim().split('\r\n');
    expect(linhas[0]).toContain('Posição;Código;Lotérica');
    expect(linhas.length).toBeGreaterThan(5);
    const x = await getRanking(req('/api/ranking?uf=SP&semanas=4&formato=xlsx'));
    expect(x.headers.get('content-disposition')).toMatch(/ranking-SP-mais_aberturas\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await x.arrayBuffer());
    const ws = wb.getWorksheet('Ranking')!;
    expect(typeof ws.getRow(2).getCell(6).value).toBe('number'); // números como números
  });

  it('GET /api/comparar valida a quantidade', async () => {
    expect((await getComparar(req('/api/comparar'))).status).toBe(400);
    expect((await getComparar(req('/api/comparar?codigos=1,2,3,4,5,6,7'))).status).toBe(400);
    expect((await getComparar(req(`/api/comparar?codigos=${minha}`))).status).toBe(200);
  });

  it('GET /api/aberturas/ao-vivo é um stream SSE que emite a leitura', async () => {
    const ctl = new AbortController();
    const r = await getAoVivo(req('/api/aberturas/ao-vivo?uf=SP', { signal: ctl.signal }));
    expect(r.headers.get('content-type')).toMatch(/text\/event-stream/);
    const leitor = r.body!.getReader();
    let texto = '';
    while (!texto.includes('event: leitura')) texto += new TextDecoder().decode((await leitor.read()).value);
    ctl.abort();
    const dados = JSON.parse(texto.split('event: leitura\ndata: ')[1]!.split('\n')[0]!) as { linhas: unknown[] };
    expect(Array.isArray(dados.linhas)).toBe(true);
  });
});

describe('exportação CSV', () => {
  it('escapa ; e aspas e usa vírgula decimal', () => {
    const csv = paraCsv([{ titulo: 'a', valor: (x: { a: string | number }) => x.a }], [{ a: 'x;y' }, { a: 'diz "oi"' }, { a: 1.5 }]);
    expect(csv).toBe('﻿a\r\n"x;y"\r\n"diz ""oi"""\r\n1,5\r\n');
  });
});
