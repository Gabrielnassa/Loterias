-- Fase 6: gestão da loja física. Registros por tipo (os cálculos ficam no core, packages/core/gestao):
-- caixa (TFL ou extra), fechamento (por caixa e dia), carro-forte, lancamento (receita/despesa/saldo inicial),
-- despesa-fixa e fiado. `chave` garante unicidade quando precisa (ex.: um fechamento por caixa e dia).
-- Fiados guardam só nome e telefone do cliente da PRÓPRIA loja (apagáveis); nada vem da CAIXA.

create table gestao_registros (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references contas (id) on delete cascade,
  loja_codigo   text not null,
  tipo          text not null check (tipo in ('caixa', 'fechamento', 'carro-forte', 'lancamento', 'despesa-fixa', 'fiado')),
  dia           date,
  chave         text,
  dados         jsonb not null,
  criado_por    uuid references usuarios (id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (conta_id, chave)
);
create index gestao_registros_busca on gestao_registros (conta_id, tipo, dia);
