import { describe, expect, it } from 'vitest';
import {
  classificarRota,
  emailValido,
  estadoConvite,
  lojasVisiveis,
  podeAbrirTela,
  podeConvidar,
  podeEnviarLink,
  podeGerenciarMembro,
  problemaNaSenha,
  telaDaRota,
  telasEfetivas,
  TELAS,
  validarMudancaDePapel,
  voltaSegura,
} from '../contas/permissoes';

describe('contas: telas e rotas', () => {
  it('cada rota cai na tela certa (a mais específica vence)', () => {
    expect(telaDaRota('/')?.id).toBe('raio-x');
    expect(telaDaRota('/ranking')?.id).toBe('raio-x');
    expect(telaDaRota('/api/minha/boloes/12/estorno')?.id).toBe('minha-boloes');
    expect(telaDaRota('/gestao/caixas')?.id).toBe('gestao-caixa');
    expect(telaDaRota('/gestao/dre')?.id).toBe('gestao-financeiro');
    expect(telaDaRota('/mercado/filas')?.id).toBe('mercado');
    expect(telaDaRota('/loterica-trevo-de-ouro')).toBeNull();
  });
  it('públicas, livres, de tela e desconhecidas (site da lotérica)', () => {
    expect(classificarRota('/entrar').acesso).toBe('publica');
    expect(classificarRota('/api/auth/link').acesso).toBe('publica');
    expect(classificarRota('/api/webhooks/asaas').acesso).toBe('publica');
    expect(classificarRota('/api/site/trevo/evento').acesso).toBe('publica');
    expect(classificarRota('/conta').acesso).toBe('livre');
    expect(classificarRota('/minha').acesso).toBe('livre');
    expect(classificarRota('/equipe')).toMatchObject({ acesso: 'tela', tela: { id: 'equipe' } });
    expect(classificarRota('/loterica-trevo-de-ouro').acesso).toBe('desconhecida');
    expect(classificarRota('/api/qualquer').acesso).toBe('livre');
    expect(new Set(TELAS.map((t) => t.id)).size).toBe(TELAS.length);
  });
});

describe('contas: papéis e permissões', () => {
  it('responsável vê tudo; sócio tudo menos o plano; colaborador só o liberado (nunca equipe/plano)', () => {
    expect(telasEfetivas({ papel: 'responsavel' })).toContain('plano');
    expect(telasEfetivas({ papel: 'socio' })).toContain('equipe');
    expect(telasEfetivas({ papel: 'socio' })).not.toContain('plano');
    expect(podeAbrirTela({ papel: 'colaborador' }, 'minha-boloes')).toBe(true);
    expect(podeAbrirTela({ papel: 'colaborador' }, 'minha-financeiro')).toBe(false);
    expect(podeAbrirTela({ papel: 'colaborador', telas: ['minha-financeiro', 'equipe', 'plano'] }, 'minha-financeiro')).toBe(true);
    expect(telasEfetivas({ papel: 'colaborador', telas: ['minha-financeiro', 'equipe', 'plano', 'inventada'] })).toEqual(['minha-financeiro']);
  });
  it('lojas: colaborador pode ficar restrito; sócio vê todas', () => {
    const lojas = [{ codigo: '2894' }, { codigo: '1234' }];
    expect(lojasVisiveis({ papel: 'colaborador', lojas: ['1234'] }, lojas)).toEqual([{ codigo: '1234' }]);
    expect(lojasVisiveis({ papel: 'colaborador', lojas: null }, lojas)).toHaveLength(2);
    expect(lojasVisiveis({ papel: 'socio', lojas: ['1234'] }, lojas)).toHaveLength(2);
  });
  it('convites e gestão da equipe', () => {
    expect(podeConvidar('responsavel', 'socio')).toBe(true);
    expect(podeConvidar('responsavel', 'responsavel')).toBe(false);
    expect(podeConvidar('socio', 'colaborador')).toBe(true);
    expect(podeConvidar('socio', 'socio')).toBe(false);
    expect(podeConvidar('colaborador', 'colaborador')).toBe(false);
    const r = { papel: 'responsavel' as const, usuarioId: 'r' };
    const s = { papel: 'socio' as const, usuarioId: 's' };
    const c = { papel: 'colaborador' as const, usuarioId: 'c' };
    expect(podeGerenciarMembro(r, s)).toBe(true);
    expect(podeGerenciarMembro(s, c)).toBe(true);
    expect(podeGerenciarMembro(s, { ...s, usuarioId: 's2' })).toBe(false);
    expect(podeGerenciarMembro(s, r)).toBe(false);
    expect(podeGerenciarMembro(r, r)).toBe(false);
    expect(validarMudancaDePapel('responsavel', 'socio', 'responsavel')).toBeNull();
    expect(validarMudancaDePapel('socio', 'colaborador', 'socio')).not.toBeNull();
    expect(validarMudancaDePapel('responsavel', 'responsavel', 'socio')).not.toBeNull();
  });
});

describe('contas: convites, links e entradas', () => {
  const agora = new Date('2026-11-22T12:00:00Z');
  it('estado do convite', () => {
    expect(estadoConvite({ expiraEm: new Date('2026-11-29T12:00:00Z') }, agora)).toBe('pendente');
    expect(estadoConvite({ expiraEm: new Date('2026-11-22T11:00:00Z') }, agora)).toBe('expirado');
    expect(estadoConvite({ expiraEm: new Date('2026-11-29T12:00:00Z'), aceitoEm: agora }, agora)).toBe('aceito');
    expect(estadoConvite({ expiraEm: new Date('2026-11-29T12:00:00Z'), canceladoEm: agora }, agora)).toBe('cancelado');
  });
  it('limite de links mágicos por hora, e-mail, senha e volta segura', () => {
    const ha = (min: number) => new Date(agora.getTime() - min * 60_000);
    expect(podeEnviarLink([ha(5), ha(10), ha(20), ha(30)], agora)).toBe(true);
    expect(podeEnviarLink([ha(5), ha(10), ha(20), ha(30), ha(59)], agora)).toBe(false);
    expect(podeEnviarLink([ha(61), ha(70), ha(80), ha(90), ha(100)], agora)).toBe(true);
    expect(emailValido('Dono@Loterica.com.br')).toBe(true);
    expect(emailValido('sem-arroba')).toBe(false);
    expect(problemaNaSenha('curta1')).not.toBeNull();
    expect(problemaNaSenha('somenteletras')).not.toBeNull();
    expect(problemaNaSenha('boa-senha-123')).toBeNull();
    expect(voltaSegura('/minha/boloes?loja=2894')).toBe('/minha/boloes?loja=2894');
    expect(voltaSegura('//evil.com')).toBe('/');
    expect(voltaSegura('https://evil.com')).toBe('/');
  });
});
