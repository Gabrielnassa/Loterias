import { describe, expect, it } from 'vitest';
import {
  aplicarEventoAsaas,
  assinaturaInicial,
  cpfCnpjValido,
  PLANOS,
  planoEfetivo,
  planoQueLibera,
  primeiroVencimento,
  somarMeses,
  telasDoPlano,
  type Assinatura,
} from '../planos/planos';
import { TELAS } from '../contas/permissoes';

const D = (s: string) => new Date(`${s}T12:00:00Z`);

describe('planos', () => {
  it('cada plano contém o anterior; toda tela está em algum plano; o Grátis sempre deixa ver o plano', () => {
    for (let i = 1; i < PLANOS.length; i++) for (const t of PLANOS[i - 1]!.telas) expect(PLANOS[i]!.telas).toContain(t);
    for (const t of TELAS) expect(planoQueLibera(t.id), t.id).not.toBeNull();
    expect(telasDoPlano('gratis')).toEqual(expect.arrayContaining(['plano', 'equipe', 'raio-x']));
    expect(planoQueLibera('minha-sugestoes')!.id).toBe('pro-mais');
    expect(planoQueLibera('gestao-caixa')!.id).toBe('gestao');
    expect(planoQueLibera('mercado')!.id).toBe('pro');
  });

  it('teste grátis de 14 dias com tudo; depois, Grátis', () => {
    const a = assinaturaInicial('c', D('2026-11-01'));
    expect(planoEfetivo(a, D('2026-11-10'))).toMatchObject({ id: 'gestao', motivo: 'teste', diasRestantesTeste: 5 });
    expect(planoEfetivo(a, D('2026-11-16'))).toMatchObject({ id: 'gratis', motivo: 'gratis' });
    expect(planoEfetivo(null, D('2026-11-16')).id).toBe('gratis');
  });

  it('assinar no teste: 1º vencimento no fim do teste; pagamento confirmado vale 1 mês; atraso tem 5 dias de tolerância', () => {
    let a: Assinatura = { ...assinaturaInicial('c', D('2026-11-01')), plano: 'pro' };
    expect(primeiroVencimento(a, D('2026-11-05'))).toEqual(a.testeAte);
    a = aplicarEventoAsaas(a, 'PAYMENT_CONFIRMED', { vencimento: D('2026-11-15') }, D('2026-11-14'));
    expect(a.status).toBe('ativa');
    expect(a.pagoAte).toEqual(D('2026-12-15'));
    expect(planoEfetivo(a, D('2026-12-01'))).toMatchObject({ id: 'pro', motivo: 'pago' });
    a = aplicarEventoAsaas(a, 'PAYMENT_OVERDUE', null, D('2026-12-16'));
    expect(planoEfetivo(a, D('2026-12-18'))).toMatchObject({ id: 'pro', motivo: 'tolerancia' });
    expect(planoEfetivo(a, D('2026-12-21'))).toMatchObject({ id: 'gratis' });
    a = aplicarEventoAsaas(a, 'PAYMENT_RECEIVED', { vencimento: D('2026-12-15') }, D('2026-12-22'));
    expect(planoEfetivo(a, D('2026-12-22'))).toMatchObject({ id: 'pro', motivo: 'pago' });
  });

  it('cancelar vale até o fim do período pago; estorno derruba; cortesia não vence', () => {
    let a: Assinatura = { ...assinaturaInicial('c', D('2026-10-01')), plano: 'pro-mais', status: 'ativa', pagoAte: D('2026-12-10') };
    a = aplicarEventoAsaas(a, 'SUBSCRIPTION_DELETED', null, D('2026-11-20'));
    expect(planoEfetivo(a, D('2026-12-01'))).toMatchObject({ id: 'pro-mais', motivo: 'pago' });
    expect(planoEfetivo(a, D('2026-12-11')).id).toBe('gratis');
    const b = aplicarEventoAsaas({ ...a, status: 'ativa', canceladaEm: null }, 'PAYMENT_REFUNDED', null, D('2026-11-20'));
    expect(planoEfetivo(b, D('2026-11-30')).id).toBe('gratis');
    expect(planoEfetivo({ ...a, status: 'cortesia', plano: 'gestao' }, D('2030-01-01')).id).toBe('gestao');
  });

  it('meses no fim do mês e CPF/CNPJ', () => {
    expect(somarMeses(D('2026-01-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(cpfCnpjValido('529.982.247-25')).toBe(true);
    expect(cpfCnpjValido('111.111.111-11')).toBe(false);
    expect(cpfCnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cpfCnpjValido('11.222.333/0001-82')).toBe(false);
  });
});
