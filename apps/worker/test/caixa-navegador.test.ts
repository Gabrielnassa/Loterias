import { ConfirmacaoHumanaNecessariaError, BloqueadoPelaFonteError, LoginNecessarioError, varrerConcurso } from '@radar/core';
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
    expect(await f.concursosAbertos()).toEqual([{ modalidade: 'mega-sena', concurso: 3089, dataSorteio: '2026-11-22' }]);
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
