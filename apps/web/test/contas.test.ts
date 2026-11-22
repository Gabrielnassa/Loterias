import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { criarSql, migrar, recriarBancoDeTeste, type Sql } from '@radar/db';
import { aceitarConvite, cadastrar, definirSenha, entrarComSenha, ErroAcesso, pedirLink, usarLink } from '@/lib/contas/acesso';
import { definirRepositorioContas } from '@/lib/contas/ativo';
import { alterarMembro, convidar, ErroEquipe, removerLoja, removerMembro, salvarLoja } from '@/lib/contas/equipe';
import { estadoVazio, lerEstadoContas, RepositorioContasMemoria } from '@/lib/contas/memoria';
import { RepositorioContasPostgres } from '@/lib/contas/postgres';
import { CABECALHO_CONTEXTO, codificarContexto, contextoDoToken, decodificarContexto, type ContextoSessao } from '@/lib/contas/sessao';
import type { RepositorioContas } from '@/lib/contas/tipos';
import { middleware } from '@/middleware';

const BASE = 'https://radar.exemplo';
const tokenDoLink = (link: string | undefined) => new URL(link!).searchParams.get('token') ?? link!.split('/').at(-1)!;

function suiteContas(nome: string, criarRepo: () => Promise<RepositorioContas>) {
  describe(`contas (${nome})`, () => {
    let repo: RepositorioContas;
    let agora: Date;
    const passar = (min: number) => (agora = new Date(agora.getTime() + min * 60_000));
    beforeEach(async () => {
      repo = await criarRepo();
      agora = new Date('2026-11-22T12:00:00Z');
      process.env.RADAR_EMAIL_LINK_NA_TELA = '1';
    });

    async function cadastrarDono(): Promise<{ token: string; ctx: ContextoSessao }> {
      const r = await cadastrar(repo, { nome: 'Dona Teste', email: 'Dona@Exemplo.com', senha: 'senha-boa-1', empresa: 'Grupo Teste', lojas: '2894=Loja Centro\n21.001234-5=Loja Bairro' }, BASE, agora);
      const s = await usarLink(repo, tokenDoLink(r.linkDev), agora, 'teste');
      return { token: s.token, ctx: (await contextoDoToken(repo, s.token, agora))! };
    }

    it('cadastro: link confirma o e-mail e cria a sessão do responsável, com as 2 lojas e todas as telas', async () => {
      const { ctx } = await cadastrarDono();
      expect(ctx.usuario.email).toBe('dona@exemplo.com');
      expect(ctx.papel).toBe('responsavel');
      expect(ctx.lojas.map((l) => l.codigo).sort()).toEqual(['1234', '2894']);
      expect(ctx.telas).toEqual(expect.arrayContaining(['plano', 'equipe', 'minha-financeiro', 'gestao-financeiro']));
      expect(decodificarContexto(codificarContexto(ctx))).toEqual(ctx);
    });

    it('link mágico: uma vez só, vence em 15 min; e-mail sem conta não recebe nada', async () => {
      await cadastrarDono();
      const r = await pedirLink(repo, { email: 'dona@exemplo.com', voltar: '/minha/boloes' }, BASE, agora);
      const t = tokenDoLink(r.linkDev);
      expect((await usarLink(repo, t, agora, null)).voltar).toBe('/minha/boloes');
      await expect(usarLink(repo, t, agora, null)).rejects.toThrow(ErroAcesso);
      const r2 = await pedirLink(repo, { email: 'dona@exemplo.com' }, BASE, agora);
      passar(16);
      await expect(usarLink(repo, tokenDoLink(r2.linkDev), agora, null)).rejects.toThrow(/vencido/);
      expect((await pedirLink(repo, { email: 'ninguem@exemplo.com' }, BASE, agora)).linkDev).toBeUndefined();
    });

    it('senha: só depois de confirmar o e-mail; errada não entra; trocar encerra as outras sessões', async () => {
      await cadastrar(repo, { nome: 'Sem Confirmar', email: 'x@exemplo.com', senha: 'senha-boa-1', empresa: 'Empresa X', lojas: '2894' }, BASE, agora);
      await expect(entrarComSenha(repo, { email: 'x@exemplo.com', senha: 'senha-boa-1' }, agora, null)).rejects.toThrow(/confirme/);
      const { token, ctx } = await cadastrarDono();
      await expect(entrarComSenha(repo, { email: 'dona@exemplo.com', senha: 'errada-123' }, agora, null)).rejects.toThrow(/não conferem/);
      const outra = await entrarComSenha(repo, { email: 'DONA@exemplo.com', senha: 'senha-boa-1' }, agora, null);
      await definirSenha(repo, ctx.usuario, { atual: 'senha-boa-1', nova: 'nova-senha-2' }, token);
      expect(await contextoDoToken(repo, outra, agora)).toBeNull();
      expect(await contextoDoToken(repo, token, agora)).not.toBeNull();
      await entrarComSenha(repo, { email: 'dona@exemplo.com', senha: 'nova-senha-2' }, agora, null);
    });

    it('convite de colaborador com telas e loja: aceita, entra e só vê o liberado', async () => {
      const { ctx: dono } = await cadastrarDono();
      const c = await convidar(repo, dono, { email: 'caixa@exemplo.com', papel: 'colaborador', telas: ['minha-boloes', 'gestao-caixa', 'plano'], lojas: ['2894'] }, BASE, agora);
      expect(c.link.startsWith(`${BASE}/convite/`)).toBe(true);
      const r = await aceitarConvite(repo, { token: tokenDoLink(c.link), nome: 'Caixa Um' }, agora, null);
      const col = (await contextoDoToken(repo, r.sessao!, agora))!;
      expect(col.papel).toBe('colaborador');
      expect(col.telas.sort()).toEqual(['gestao-caixa', 'minha-boloes']);
      expect(col.lojas.map((l) => l.codigo)).toEqual(['2894']);
      await expect(aceitarConvite(repo, { token: tokenDoLink(c.link), nome: 'De Novo' }, agora, null)).rejects.toThrow(/já foi usado/);
      // colaborador não convida nem mexe em lojas
      await expect(convidar(repo, col, { email: 'z@exemplo.com', papel: 'colaborador' }, BASE, agora)).rejects.toThrow(ErroEquipe);
      await expect(salvarLoja(repo, col, { codigo: '9999' })).rejects.toThrow(ErroEquipe);
    });

    it('sócio gerencia colaboradores (não sócios); responsável transfere a conta; remover tira o acesso', async () => {
      const { ctx: dono } = await cadastrarDono();
      const s = await convidar(repo, dono, { email: 'socio@exemplo.com', papel: 'socio' }, BASE, agora);
      const socio = (await contextoDoToken(repo, (await aceitarConvite(repo, { token: tokenDoLink(s.link), nome: 'Sócio' }, agora, null)).sessao!, agora))!;
      expect(socio.telas).toContain('equipe');
      expect(socio.telas).not.toContain('plano');
      await expect(convidar(repo, socio, { email: 'outro@exemplo.com', papel: 'socio' }, BASE, agora)).rejects.toThrow(/não pode convidar/);
      const c = await convidar(repo, socio, { email: 'col@exemplo.com', papel: 'colaborador' }, BASE, agora);
      const sessCol = (await aceitarConvite(repo, { token: tokenDoLink(c.link), nome: 'Col' }, agora, null)).sessao!;
      const col = (await contextoDoToken(repo, sessCol, agora))!;
      await alterarMembro(repo, socio, { usuarioId: col.usuario.id, papel: 'colaborador', telas: ['minha-financeiro'] });
      expect((await contextoDoToken(repo, sessCol, agora))!.telas).toEqual(['minha-financeiro']);
      await expect(alterarMembro(repo, socio, { usuarioId: col.usuario.id, papel: 'socio' })).rejects.toThrow(ErroEquipe);
      await expect(alterarMembro(repo, socio, { usuarioId: dono.usuario.id, papel: 'colaborador' })).rejects.toThrow(ErroEquipe);
      // transferir a responsabilidade
      await alterarMembro(repo, dono, { usuarioId: socio.usuario.id, papel: 'responsavel' });
      const membros = await repo.membros(dono.conta!.id);
      expect(membros.find((m) => m.usuarioId === socio.usuario.id)!.papel).toBe('responsavel');
      expect(membros.find((m) => m.usuarioId === dono.usuario.id)!.papel).toBe('socio');
      // remover
      const novoResp = (await contextoDoToken(repo, (await entrarComSenhaOuLink(socio.usuario.email))!, agora))!;
      await removerMembro(repo, novoResp, col.usuario.id);
      const semConta = (await contextoDoToken(repo, sessCol, agora))!;
      expect(semConta.conta).toBeNull();
      expect(semConta.telas).toEqual([]);
    });

    it('lojas: adicionar com o código em qualquer forma, franquia própria; a conta não fica sem loja', async () => {
      const { token, ctx } = await cadastrarDono();
      expect(await salvarLoja(repo, ctx, { codigo: '21.005555-1', nome: 'Loja Nova', franquiaLimite: '12.000,50' })).toBe('5555');
      const lojas = (await contextoDoToken(repo, token, agora))!.lojas;
      expect(lojas.find((l) => l.codigo === '5555')!.franquiaLimite).toBe(12000.5);
      await removerLoja(repo, ctx, '5555');
      await removerLoja(repo, ctx, '1234');
      await expect(removerLoja(repo, ctx, '2894')).rejects.toThrow(/ao menos uma/);
    });

    async function entrarComSenhaOuLink(email: string) {
      const r = await pedirLink(repo, { email }, BASE, agora);
      return (await usarLink(repo, tokenDoLink(r.linkDev), agora, null)).token;
    }
  });
}

suiteContas('memória', async () => new RepositorioContasMemoria(estadoVazio()));

const URL_TESTE = process.env.DATABASE_URL_TESTE;
if (URL_TESTE) {
  let sql: Sql;
  beforeAll(async () => {
    sql = criarSql(await recriarBancoDeTeste(URL_TESTE, 'radar_teste_contas'), { max: 4 });
    await migrar(sql, () => {});
  });
  afterAll(async () => {
    await sql?.end();
  });
  suiteContas('postgres', async () => {
    await sql`truncate usuarios, contas, conta_lojas, membros, convites, tokens_login, sessoes cascade`;
    return new RepositorioContasPostgres(sql);
  });
}

describe('estado em memória serializável (a demonstração guarda no navegador)', () => {
  it('JSON ida e volta mantém as datas', async () => {
    const r = new RepositorioContasMemoria(estadoVazio());
    const u = await r.criarUsuario({ email: 'a@b.com', nome: 'A', emailVerificadoEm: new Date('2026-11-22T10:00:00Z') });
    const e = lerEstadoContas(JSON.stringify(r.estado));
    expect(e.usuarios[0]!.emailVerificadoEm).toEqual(new Date('2026-11-22T10:00:00Z'));
    expect(e.usuarios[0]!.id).toBe(u.id);
  });
});

describe('middleware (porteiro do painel)', () => {
  let repo: RepositorioContasMemoria;
  let tokenDono: string;
  let tokenCol: string;
  beforeAll(async () => {
    process.env.RADAR_AUTH = 'memoria';
    process.env.RADAR_EMAIL_LINK_NA_TELA = '1';
    repo = new RepositorioContasMemoria(estadoVazio());
    definirRepositorioContas(repo);
    const agora = new Date();
    const r = await cadastrar(repo, { nome: 'Dono', email: 'dono@exemplo.com', empresa: 'Grupo G', lojas: '2894' }, BASE, agora);
    tokenDono = (await usarLink(repo, tokenDoLink(r.linkDev), agora, null)).token;
    const ctx = (await contextoDoToken(repo, tokenDono, agora))!;
    const c = await convidar(repo, ctx, { email: 'col@exemplo.com', papel: 'colaborador', telas: ['minha-boloes'] }, BASE, agora);
    tokenCol = (await aceitarConvite(repo, { token: tokenDoLink(c.link), nome: 'Col' }, agora, null)).sessao!;
  });
  afterAll(() => {
    delete process.env.RADAR_AUTH;
    definirRepositorioContas(undefined);
  });
  const pedir = (caminho: string, o: { token?: string; metodo?: string; origem?: string; cabecalhos?: Record<string, string> } = {}) =>
    middleware(
      new NextRequest(`http://localhost:3000${caminho}`, {
        method: o.metodo ?? 'GET',
        headers: { host: 'localhost:3000', ...(o.token ? { cookie: `radar_sessao=${o.token}` } : {}), ...(o.origem ? { origin: o.origem } : {}), ...(o.cabecalhos ?? {}) },
      }),
    );
  const contextoRepassado = (r: Response) => decodificarContexto(r.headers.get(`x-middleware-request-${CABECALHO_CONTEXTO}`));

  it('sem sessão: painel vai para /entrar com a volta; API dá 401; públicas e o site passam', async () => {
    const r = await pedir('/ranking?uf=SP');
    expect(r.status).toBe(307);
    expect(r.headers.get('location')).toBe('http://localhost:3000/entrar?voltar=%2Franking%3Fuf%3DSP');
    expect((await pedir('/api/ranking')).status).toBe(401);
    expect((await pedir('/entrar')).headers.get('x-middleware-next')).toBe('1');
    expect((await pedir('/loterica-trevo-de-ouro')).headers.get('x-middleware-next')).toBe('1');
  });
  it('com sessão: o contexto segue para a página; o cabeçalho forjado pelo navegador é descartado', async () => {
    const r = await pedir('/ranking', { token: tokenDono });
    expect(contextoRepassado(r)?.usuario.email).toBe('dono@exemplo.com');
    const forjado = await pedir('/loterica-x', { cabecalhos: { [CABECALHO_CONTEXTO]: 'eyJmYWxzbyI6dHJ1ZX0=' } });
    expect(contextoRepassado(forjado)).toBeNull();
  });
  it('colaborador: tela liberada passa; outra vai para /sem-permissao (API 403); a raiz leva à 1ª tela liberada', async () => {
    expect(contextoRepassado(await pedir('/minha/boloes', { token: tokenCol }))?.papel).toBe('colaborador');
    const r = await pedir('/minha/financeiro', { token: tokenCol });
    expect(r.headers.get('location')).toBe('http://localhost:3000/sem-permissao?tela=minha-financeiro');
    expect((await pedir('/api/equipe', { token: tokenCol, metodo: 'POST', origem: 'http://localhost:3000' })).status).toBe(403);
    expect((await pedir('/', { token: tokenCol })).headers.get('location')).toBe('http://localhost:3000/minha/boloes');
  });
  it('POST vindo de outro site é recusado', async () => {
    expect((await pedir('/api/equipe', { token: tokenDono, metodo: 'POST', origem: 'https://malicioso.exemplo' })).status).toBe(403);
  });
});
