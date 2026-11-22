-- Chaves da API pública (/api/publica/v1): usadas pelo plugin WordPress e por outras integrações da conta.
-- O banco guarda só o SHA-256; a chave aparece uma única vez, ao ser criada.
create table chaves_api (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references contas (id) on delete cascade,
  nome          text not null,
  prefixo       text not null,
  hash          text not null unique,
  criado_por    uuid references usuarios (id) on delete set null,
  criado_em     timestamptz not null default now(),
  ultimo_uso_em timestamptz,
  revogada_em   timestamptz
);
create index chaves_api_conta on chaves_api (conta_id);
