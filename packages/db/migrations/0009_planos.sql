-- Fase 6: planos e cobrança (Asaas, SÓ sandbox por enquanto). Nenhum dado de cartão passa por aqui:
-- o pagamento é feito na página do próprio Asaas (link da cobrança) ou por Pix.

create table assinaturas (
  conta_id            uuid primary key references contas (id) on delete cascade,
  plano               text not null check (plano in ('gratis', 'pro', 'pro-mais', 'gestao')),
  status              text not null check (status in ('teste', 'ativa', 'atrasada', 'cancelada', 'cortesia')),
  teste_ate           timestamptz,
  pago_ate            timestamptz,
  forma               text check (forma in ('PIX', 'CREDIT_CARD')),
  valor               numeric(10, 2),
  asaas_cliente_id    text,
  asaas_assinatura_id text unique,
  cancelada_em        timestamptz,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create table cobrancas (
  id                  text primary key,   -- id do pagamento no Asaas
  conta_id            uuid not null references contas (id) on delete cascade,
  asaas_assinatura_id text,
  valor               numeric(10, 2) not null,
  vencimento          date not null,
  status              text not null,      -- PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED...
  forma               text,
  link                text,               -- página de pagamento do Asaas
  pago_em             timestamptz,
  atualizado_em       timestamptz not null default now()
);
create index cobrancas_conta on cobrancas (conta_id, vencimento desc);

-- Cada evento do webhook uma vez só (o Asaas reenvia).
create table webhooks_asaas (
  id           bigserial primary key,
  chave        text not null unique,
  evento       text not null,
  recebido_em  timestamptz not null default now(),
  corpo        jsonb not null,
  processado_em timestamptz,
  erro         text
);
