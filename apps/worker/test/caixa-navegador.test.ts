import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BloqueadoPelaFonteError,
  ConfirmacaoHumanaNecessariaError,
  lerPaginas,
  LoginNecessarioError,
  SessaoExpiradaError,
  varrerConcurso,
} from '@radar/core';
import { FonteCaixaLinks } from '../src/fontes/caixa-links';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FonteCaixaNavegador } from '../src/fontes/caixa-navegador';
import { iniciarPortalFalso, sessaoFalsa, type PortalFalso } from './portal-falso';

/** Adaptador de navegador real (Chromium via Playwright) contra o portal FALSO local. */
let portal: PortalFalso;
const abertos: FonteCaixaNavegador[] = [];
const criar = (cookies: Record<string, string> | null, extra: Partial<ConstructorParameters<typeof FonteCaixaNavegador>[0]> = {}) => {
  const f = new FonteCaixaNavegador({
    baseUrl: portal.url,
    intervaloMinimoMs: 300,
    timeoutMs: 8000,
    backoffBaseMs: 100,
    modalidades: ['mega-sena'],
    ...(cookies ? { estadoSessao: sessaoFalsa(portal.url, cookies) } : {}),
    ...extra,
  });
  abertos.push(f);
  return f;
};

beforeAll(async () => {
  portal = await iniciarPortalFalso();
});
afterAll(async () => {
  for (const f of abertos) await f.fechar();
  await portal?.fechar();
});

describe('adaptador caixa-navegador (portal falso)', () => {
  it('sem sessão: para na pergunta de idade e NÃO responde por conta própria', async () => {
    const f = criar(null);
    portal.requisicoesLista.length = 0;
    await expect(f.pagina({ modalidade: 'mega-sena', concurso: 3089, pagina: 1 })).rejects.toThrow(ConfirmacaoHumanaNecessariaError);
    expect(portal.requisicoesLista).toHaveLength(0);
    expect(f.acoes).toBe(1); // só carregou a página (não clicou em nada nem tentou de novo)
  });

  it('com sessão sem login: a lista geral volta para a home => LoginNecessarioError', async () => {
    const f = criar({ termosDeUso: '1' });
    await expect(f.pagina({ modalidade: 'mega-sena', concurso: 3089, pagina: 1 })).rejects.toThrow(LoginNecessarioError);
  });

  it('link público da lotérica funciona sem login', async () => {
    const f = criar({ termosDeUso: '1' });
    const p = await f.pagina({ modalidade: 'mega-sena', concurso: 3089, pagina: 1, codigoLoterica: '990105' });
    expect(p.itens.length).toBeGreaterThan(0);
    expect(p.itens.every((b) => b.loterica.codigoCaixa === '990105')).toBe(true);
    expect(p.itens.map((b) => b.filaFonte)).toEqual([1, 2, 3]);
    expect(portal.requisicoesLista.at(-1)!.caminho).toBe('boloes/recuperar-boloes-disponiveis-link');
  });

  it('sessão preparada: varredura completa paginando por "Seguinte", no ritmo configurado', async () => {
    const f = criar({ termosDeUso: '1', logado: '1' });
    portal.requisicoesLista.length = 0;
    const leitura = await varrerConcurso(f, { modalidade: 'mega-sena', concurso: 3089 });
    expect(leitura.completa).toBe(true);
    expect(leitura.paginasLidas).toBe(3);
    expect(leitura.itens).toHaveLength(75);
    expect(new Set(leitura.itens.map((i) => i.idCaixa)).size).toBe(75);
    expect(leitura.itens[0]!.filaFonte).toBe(1);
    expect(leitura.itens.at(-1)!.filaFonte).toBe(3);
    expect(leitura.ordemDaVitrine).toBe(false);
    expect(leitura.desvioServidorMs).toBeTypeOf('number');
    const reqs = portal.requisicoesLista.map((r) => r.pagina);
    expect(reqs).toEqual([1, 2, 3]);
    const gaps = portal.requisicoesLista.slice(1).map((r, i) => r.em - portal.requisicoesLista[i]!.em);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(250);
  });

  it('concursos abertos e contagens a partir da 1ª página (com cache)', async () => {
    const f = criar({ termosDeUso: '1', logado: '1' });
    expect(await f.concursosAbertos()).toEqual([
      { modalidade: 'mega-sena', concurso: 3089, dataSorteio: '2026-11-22', sorteioEm: new Date('2026-11-23T00:00:00Z') },
    ]);
    const antes = f.acoes;
    expect(await f.contagens()).toEqual([{ modalidade: 'mega-sena', concurso: 3089, boloes: 75 }]);
    expect(f.acoes).toBe(antes); // usou o cache
  });

  it('403 ou captcha: para na hora, sem nova tentativa', async () => {
    const f = criar({ termosDeUso: '1', logado: '1' });
    portal.forcar = [403];
    await expect(f.pagina({ modalidade: 'mega-sena', concurso: 3089, pagina: 1 })).rejects.toThrow(BloqueadoPelaFonteError);
    expect(f.acoes).toBe(1);
    const g = criar({ termosDeUso: '1', logado: '1' });
    portal.forcar = ['captcha'];
    await expect(g.pagina({ modalidade: 'mega-sena', concurso: 3089, pagina: 1 })).rejects.toThrow(BloqueadoPelaFonteError);
  });

  it('503 transitório: backoff e nova tentativa', async () => {
    const f = criar({ termosDeUso: '1', logado: '1' });
    portal.forcar = [503];
    const p = await f.pagina({ modalidade: 'mega-sena', concurso: 3089, pagina: 1 });
    expect(p.itens).toHaveLength(30);
    expect(f.acoes).toBe(2);
  });
});

describe('navegação, conta dedicada e modo links', () => {
  it('reler a borda: Anterior + Seguinte (2 ações) sem voltar para a página 1', async () => {
    const f = criar({ termosDeUso: '1', logado: '1' });
    await varrerConcurso(f, { modalidade: 'mega-sena', concurso: 3089 }); // termina na pág. 3
    const antes = f.acoes;
    portal.requisicoesLista.length = 0;
    const l = await lerPaginas(f, { modalidade: 'mega-sena', concurso: 3089 }, [2, 3]);
    expect(l.itens).toHaveLength(45);
    expect(l.itens[0]!.posicaoObservada).toBe(31);
    expect(portal.requisicoesLista.map((r) => r.pagina)).toEqual([2, 3]);
    expect(f.acoes - antes).toBe(2);
    // a mesma página de novo: Anterior + Seguinte
    portal.requisicoesLista.length = 0;
    await f.pagina({ modalidade: 'mega-sena', concurso: 3089, pagina: 3 });
    expect(portal.requisicoesLista.map((r) => r.pagina)).toEqual([2, 3]);
  });

  it('conta dedicada com sessão expirada: para com SessaoExpiradaError e volta sozinha quando a sessão é renovada', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sessao-'));
    const arq = join(dir, 'estado.json');
    writeFileSync(arq, JSON.stringify(sessaoFalsa(portal.url, { termosDeUso: '1' }))); // login caiu
    const f = new FonteCaixaNavegador({ baseUrl: portal.url, estadoSessao: arq, contaDedicada: true, intervaloMinimoMs: 200, timeoutMs: 8000 });
    abertos.push(f);
    const erro = await f.pagina({ modalidade: 'mega-sena', concurso: 3089, pagina: 1 }).catch((e) => e);
    expect(erro).toBeInstanceOf(SessaoExpiradaError);
    expect(erro.message).toMatch(/caixa:preparar-sessao/);
    // uma pessoa refaz o login (arquivo de sessão novo)
    writeFileSync(arq, JSON.stringify(sessaoFalsa(portal.url, { termosDeUso: '1', logado: '1' })));
    const futuro = new Date(Date.now() + 5000);
    utimesSync(arq, futuro, futuro);
    const p = await f.pagina({ modalidade: 'mega-sena', concurso: 3089, pagina: 1 });
    expect(p.itens).toHaveLength(30);
  });

  it('modo links (sem conta): só os bolões das lotéricas monitoradas, colocação marcada como indisponível', async () => {
    const nav = criar({ termosDeUso: '1' }); // sem login
    const f = new FonteCaixaLinks(nav, ['990105', '990110']);
    expect(f.escopoColocacao).toBe('monitoradas');
    const l = await varrerConcurso(f, { modalidade: 'mega-sena', concurso: 3089 });
    expect(l.completa).toBe(true);
    expect(new Set(l.itens.map((i) => i.loterica.codigoCaixa))).toEqual(new Set(['990105', '990110']));
    expect(l.itens.every((i) => i.filaFonte !== undefined)).toBe(true);
    expect(await f.concursosAbertos()).toEqual([expect.objectContaining({ modalidade: 'mega-sena', concurso: 3089 })]);
    expect(await f.contagens()).toEqual([]);
    expect(portal.requisicoesLista.at(-1)!.caminho).toBe('boloes/recuperar-boloes-disponiveis-link');
  });
});

describe('escopos da vitrine: cidade -> resto do estado (portal falso)', () => {
  let p2: PortalFalso;
  const fontes: FonteCaixaNavegador[] = [];
  beforeAll(async () => {
    p2 = await iniciarPortalFalso(undefined, { escopos: [45, 30] }); // cidade 2 págs. (30 + 15), estado 1 pág.
  });
  afterAll(async () => {
    for (const f of fontes) await f.fechar();
    await p2?.fechar();
  });
  const criar2 = (escopos: 'cidade' | 'estado') => {
    const f = new FonteCaixaNavegador({ baseUrl: p2.url, intervaloMinimoMs: 200, timeoutMs: 8000, backoffBaseMs: 100, modalidades: ['mega-sena'], estadoSessao: sessaoFalsa(p2.url, { termosDeUso: '1', logado: '1' }), escopos });
    fontes.push(f);
    return f;
  };
  it('padrão: lê só a cidade, com cada página marcada no escopo', async () => {
    const f = criar2('cidade');
    const l = await varrerConcurso(f, { modalidade: 'mega-sena', concurso: 3089 });
    expect(l.completa).toBe(true);
    expect(l.itens).toHaveLength(45);
    const p1 = await f.pagina({ modalidade: 'mega-sena', concurso: 3089, pagina: 1 });
    expect(p1.escopo).toEqual({ indice: 0, nome: 'cidade', pagina: 1, totalPaginas: 2, totalItens: 45 });
  });
  it('CAIXA_ESCOPOS=estado: depois da última página da cidade, segue para a página 1 do estado', async () => {
    const f = criar2('estado');
    const vistos: unknown[] = [];
    const contada = { ...f, nome: f.nome, concursosAbertos: () => f.concursosAbertos(), contagens: () => f.contagens(), pagina: async (c: Parameters<typeof f.pagina>[0]) => { const p = await f.pagina(c); vistos.push([p.pagina, p.escopo?.nome, p.escopo?.pagina, p.haMais]); return p; } };
    const l = await varrerConcurso(contada, { modalidade: 'mega-sena', concurso: 3089 });
    expect(l.completa).toBe(true);
    expect(l.itens).toHaveLength(75);
    expect(vistos).toEqual([[1, 'cidade', 1, true], [2, 'cidade', 2, true], [3, 'estado', 1, false]]);
    expect(l.itens.at(-1)!.posicaoObservada).toBe(75);
  });
});

