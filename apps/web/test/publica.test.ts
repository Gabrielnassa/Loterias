import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { horarioSP } from '@radar/core';
import { GET } from '@/app/api/publica/v1/[recurso]/route';
import { definirRepositorioContas } from '@/lib/contas/ativo';
import { criarChave, revogarChave } from '@/lib/contas/chaves-api';
import { estadoVazio, RepositorioContasMemoria } from '@/lib/contas/memoria';
import { montarContexto, type ContextoSessao } from '@/lib/contas/sessao';
import { FonteSimuladaRaioX } from '@/lib/dados';
import { definirFonteDeDados } from '@/lib/fonte-dados';
import { middleware } from '@/middleware';

const fonte = new FonteSimuladaRaioX(() => horarioSP(2026, 11, 21, 23, 0), Number.POSITIVE_INFINITY, { semanas: 3, nLotericas: 300 });

describe('API pública v1 (plugin WordPress)', () => {
  let repo: RepositorioContasMemoria;
  let ctx: ContextoSessao;
  let chave: string;
  let codigo: string;
  beforeAll(async () => {
    process.env.RADAR_AUTH = 'memoria';
    repo = new RepositorioContasMemoria(estadoVazio());
    definirRepositorioContas(repo);
    definirFonteDeDados(fonte);
    codigo = fonte.historico().lotericas[0]!.codigoCaixa;
    const u = await repo.criarUsuario({ email: 'dono@exemplo.com', nome: 'Dono' });
    const c = await repo.criarConta('Grupo');
    await repo.salvarLoja({ contaId: c.id, codigo, nome: 'Loja Centro', franquiaLimite: 8000 });
    await repo.salvarMembro({ contaId: c.id, usuarioId: u.id, papel: 'responsavel', telas: null, lojas: null });
    ctx = (await montarContexto(repo, { usuarioId: u.id, contaId: c.id }))!;
    chave = (await criarChave(repo, ctx, 'Site WordPress')).chave;
  });
  afterAll(() => {
    delete process.env.RADAR_AUTH;
    definirRepositorioContas(undefined);
    definirFonteDeDados(undefined);
  });
  const pedir = async (caminho: string, k: string | null = chave) => {
    const [recurso, q] = caminho.split('?');
    const r = await GET(new Request(`http://x/api/publica/v1/${recurso}${q ? `?${q}` : ''}`, { headers: k ? { authorization: `Bearer ${k}` } : {} }), { params: Promise.resolve({ recurso: recurso! }) });
    return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
  };

  it('sem chave ou com chave errada: 401; a chave guardada é só o hash', async () => {
    expect((await pedir('conta', null)).status).toBe(401);
    expect((await pedir('conta', 'rl_errada')).status).toBe(401);
    expect(chave).toMatch(/^rl_/);
    expect(JSON.stringify(repo.estado.chavesApi)).not.toContain(chave);
  });
  it('conta, Raio-X, ranking e bolões', async () => {
    const c = await pedir('conta');
    expect(c.corpo).toMatchObject({ conta: 'Grupo', lojas: [{ codigo, nome: 'Loja Centro' }] });
    const rx = await pedir(`raio-x?loterica=${codigo}&semanas=2`);
    expect(rx.status).toBe(200);
    expect(rx.corpo).toMatchObject({ semanas: 2, loterica: { codigoCaixa: codigo } });
    expect(String(rx.corpo.aviso)).toMatch(/Estimativas/);
    const rk = await pedir('ranking?uf=SP&limite=5');
    expect((rk.corpo.linhas as unknown[]).length).toBeLessThanOrEqual(5);
    const b = await pedir(`boloes?loja=${codigo}`);
    expect(b.status).toBe(200);
    expect(Array.isArray(b.corpo.boloes)).toBe(true);
    // loja que não é da conta
    expect((await pedir('boloes?loja=999999')).status).toBe(403);
    expect((await pedir('inventado')).status).toBe(404);
  });
  it('chave revogada para de funcionar', async () => {
    const outra = await criarChave(repo, ctx, 'Teste');
    expect((await pedir('conta', outra.chave)).status).toBe(200);
    await revogarChave(repo, ctx, outra.registro.id);
    expect((await pedir('conta', outra.chave)).status).toBe(401);
  });
  it('middleware: API pública passa sem login; o painel não abre em iframe; o site público abre nas origens permitidas', async () => {
    process.env.RADAR_EMBED_ORIGENS = 'https://nassatech.com.br javascript:alert(1)';
    const req = (c: string) => new NextRequest(`http://localhost:3000${c}`, { headers: { host: 'localhost:3000' } });
    const api = await middleware(req('/api/publica/v1/conta'));
    expect(api.headers.get('x-middleware-next')).toBe('1');
    expect((await middleware(req('/entrar'))).headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
    expect((await middleware(req('/ranking'))).headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
    expect((await middleware(req('/loterica-sorte-feliz'))).headers.get('content-security-policy')).toBe("frame-ancestors 'self' https://nassatech.com.br");
    delete process.env.RADAR_EMBED_ORIGENS;
  });
});
