import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { horarioSP, lerPreferencias } from '@radar/core';
import { criarSql, migrar, recriarBancoDeTeste, type Sql } from '@radar/db';
import { despachar, recebe } from '../despachar';
import { GeradorDeAlertas } from '../gerar';
import { estadoAvisosVazio, lerEstadoAvisos, RepositorioAvisosMemoria } from '../memoria';
import { RepositorioAvisosPostgres } from '../postgres';
import type { CargaPush, EnviarPush, MembroDestino } from '../tipos';

const membros: Record<string, MembroDestino[]> = {
  c1: [
    { usuarioId: 'dono', papel: 'responsavel', telas: null, lojas: null },
    { usuarioId: 'col', papel: 'colaborador', telas: ['minha-boloes'], lojas: ['2894'] },
    { usuarioId: 'col2', papel: 'colaborador', telas: ['monitoradas'], lojas: ['1234'] },
  ],
};
const fonteMembros = {
  membros: async (c: string) => membros[c] ?? [],
  contasComLoja: async (codigo: string) => (codigo === '2894' ? ['c1'] : []),
  usuariosComConta: async () => [{ usuarioId: 'dono', contaId: 'c1' }],
};

describe('despacho: quem recebe e por qual aparelho', () => {
  it('central para quem pode ver; push só nos aparelhos que aceitam; uma vez por chave', async () => {
    const repo = new RepositorioAvisosMemoria(fonteMembros);
    const enviados: { endpoint: string; carga: CargaPush }[] = [];
    const enviar: EnviarPush = async (a, carga) => {
      enviados.push({ endpoint: a.endpoint, carga });
      return a.endpoint === 'velho' ? 'expirado' : 'ok';
    };
    await repo.salvarAparelho({ usuarioId: 'dono', endpoint: 'celular', p256dh: 'k', auth: 'a', preferencias: lerPreferencias({ vendas: 'todas' }) });
    await repo.salvarAparelho({ usuarioId: 'dono', endpoint: 'pc', p256dh: 'k', auth: 'a', preferencias: lerPreferencias({ vendas: 'nenhuma' }) });
    await repo.salvarAparelho({ usuarioId: 'col', endpoint: 'velho', p256dh: 'k', auth: 'a', preferencias: lerPreferencias({ vendas: 'todas' }) });
    const venda = { chave: 'vendas:2894:1:x', categoria: 'venda' as const, titulo: 'Loja: 3 cotas', corpo: '...', url: '/minha/boloes', em: new Date(), lotericaCodigo: '2894', hoje: true };
    expect(await despachar(repo, venda, { contaId: 'c1' }, enviar)).toEqual({ notificacoes: 2, pushes: 1 });
    expect(enviados.map((e) => e.endpoint).sort()).toEqual(['celular', 'velho']);
    expect(await repo.aparelhos('col')).toHaveLength(0); // inscrição expirada foi desativada
    expect(await despachar(repo, venda, { contaId: 'c1' }, enviar)).toEqual({ notificacoes: 0, pushes: 0 });
    expect(await repo.naoLidas('dono')).toBe(1);
    await repo.marcarLidas('dono');
    expect(await repo.naoLidas('dono')).toBe(0);
    // monitorada (de terceiros) chega ao colaborador com a tela, mesmo restrito a outra loja
    expect(recebe(membros.c1![2]!, { categoria: 'monitorada-abertura', lotericaCodigo: '9999' })).toBe(true);
    expect(recebe(membros.c1![1]!, { categoria: 'monitorada-abertura', lotericaCodigo: '9999' })).toBe(false);
    expect(recebe(membros.c1![2]!, { categoria: 'venda', lotericaCodigo: '2894' })).toBe(false);
    expect(lerEstadoAvisos(JSON.stringify(repo.estado)).notificacoes[0]!.criadoEm).toBeInstanceOf(Date);
    expect(estadoAvisosVazio().proximoId).toBe(1);
  });
});

const URL_TESTE = process.env.DATABASE_URL_TESTE;
(URL_TESTE ? describe : describe.skip)('gerador de alertas no PostgreSQL', () => {
  let sql: Sql;
  const pushes: CargaPush[] = [];
  const enviar: EnviarPush = async (_a, c) => {
    pushes.push(c);
    return 'ok';
  };
  const t0 = horarioSP(2026, 11, 21, 21, 45);
  beforeAll(async () => {
    sql = criarSql(await recriarBancoDeTeste(URL_TESTE!, 'radar_teste_avisos'), { max: 3 });
    await migrar(sql, () => {});
    const [u] = await sql`insert into usuarios (email, nome, email_verificado_em) values ('dono@exemplo.com', 'Dono', now()) returning id`;
    const [c] = await sql`insert into contas (nome) values ('Grupo') returning id`;
    await sql`insert into membros (conta_id, usuario_id, papel) values (${c!.id}, ${u!.id}, 'responsavel')`;
    await sql`insert into conta_lojas (conta_id, loterica_codigo, nome) values (${c!.id}, '2894', 'Minha Loja')`;
    await sql`insert into monitoradas (conta_id, loterica_codigo) values (${c!.id}, '5555')`;
    await sql`insert into aparelhos (usuario_id, endpoint, p256dh, auth, preferencias) values (${u!.id}, 'https://push.exemplo/1', 'k', 'a', ${sql.json({ vendas: 'todas' })})`;
    await sql`insert into lotericas (codigo_caixa, nome, cidade, uf) values ('2894', 'Minha Loja', 'São Paulo', 'SP'), ('5555', 'Rival', 'São Paulo', 'SP')`;
    await sql`insert into concursos (modalidade_id, numero, abre_em, fecha_em, data_sorteio)
              values ((select id from modalidades where slug = 'mega-sena'), 3089, ${t0.toISOString()}::timestamptz, ${horarioSP(2026, 11, 22, 20, 0).toISOString()}::timestamptz, '2026-11-22')`;
    const bolao = async (idCaixa: string, codigo: string, seg: number, disp: number) => {
      const [b] = await sql`
        insert into boloes (id_caixa, loterica_id, concurso_id, jogos, dezenas, cotas_total, valor_cota, valor_aposta, cotas_disponiveis,
                            first_seen_at, last_seen_at, fila, fila_calculada, pos_entrada_calc_brasil, pos_entrada_calc_uf, pos_entrada_calc_cidade, pos_entrada_uf)
        values (${idCaixa}, (select id from lotericas where codigo_caixa = ${codigo}), (select id from concursos where numero = 3089), 4, 9, 100, 20.16, 2016, ${disp},
                ${new Date(t0.getTime() + seg * 1000).toISOString()}::timestamptz, now(), 1, 1, 10, 7, 3, 7) returning id`;
      return b!.id as string;
    };
    await bolao('r1', '5555', 12, 100);
    await bolao('r2', '5555', 40, 100);
    const meu = await bolao('m1', '2894', 30, 90);
    await sql`insert into eventos_bolao (bolao_id, tipo, em, quantidade) values (${meu}, 'venda', ${horarioSP(2026, 11, 22, 9, 59, 30).toISOString()}::timestamptz, 10)`;
    await sql`insert into bolao_jogos (bolao_id, ordem, numeros) values (${meu}, 1, ${[4, 15, 23, 31, 42, 58, 1, 2, 3]})`;
  });
  afterAll(async () => {
    await sql?.end();
  });

  it('monitorada entrou na abertura: 1 alerta (o 1º bolão), com push', async () => {
    const g = new GeradorDeAlertas(sql, new RepositorioAvisosPostgres(sql), enviar);
    const c = await g.rodar(new Date(t0.getTime() + 60_000));
    expect(c.abertura).toBe(1);
    expect(pushes.at(-1)).toMatchObject({ categoria: 'monitorada-abertura', titulo: 'Rival entrou na abertura', corpo: 'Mega-Sena 3089: 1º bolão às 21:45:12 (+12 s), 7º em SP (pág. 1).' });
    expect((await g.rodar(new Date(t0.getTime() + 90_000))).abertura).toBe(0);
  });

  it('vendas da loja, resultado oficial e prêmio no bolão', async () => {
    const repo = new RepositorioAvisosPostgres(sql);
    const g = new GeradorDeAlertas(sql, repo, enviar);
    const agora = horarioSP(2026, 11, 22, 10, 0);
    expect((await g.rodar(agora)).vendas).toBe(1);
    expect(pushes.at(-1)!.titulo).toBe('Minha Loja: 10 cotas vendidas');
    // resultado com sena nos 6 primeiros números do jogo de 9 dezenas
    const cid = (await sql`select id from concursos where numero = 3089`)[0]!.id;
    await sql`insert into resultados (concurso_id, data_apuracao, dezenas, acumulado, obtido_em) values (${cid}, '2026-11-22', ${[4, 15, 23, 31, 42, 58]}, false, ${agora.toISOString()}::timestamptz)`;
    await sql`insert into rateios (concurso_id, faixa, descricao, acertos, ganhadores, valor_premio) values (${cid}, 1, '6 acertos', 6, 1, 1000000), (${cid}, 2, '5 acertos', 5, 30, 30000), (${cid}, 3, '4 acertos', 4, 2000, 1000)`;
    const g2 = new GeradorDeAlertas(sql, repo, enviar);
    const c = await g2.rodar(new Date(agora.getTime() + 60_000));
    expect(c.resultado).toBe(2); // resultado + prêmio
    const titulos = pushes.slice(-2).map((p) => p.titulo);
    expect(titulos).toContain('Resultado Mega-Sena 3089');
    expect(titulos).toContain('Saiu prêmio na Minha Loja!');
    const [u] = await sql`select id from usuarios`;
    expect((await repo.notificacoes(u!.id as string)).map((n) => n.categoria).sort()).toEqual(['monitorada-abertura', 'premio', 'resultado', 'venda']);
  });
});
