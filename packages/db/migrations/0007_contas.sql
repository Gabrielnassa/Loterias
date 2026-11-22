-- Fase 6: contas, equipe, convites, login (link mágico ou senha) e sessões.
-- Senhas: só o hash (scrypt). Tokens (link, convite, sessão): só o SHA-256; o valor vai no e-mail/cookie.

create table usuarios (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique check (email = lower(email)),
  nome                text not null,
  senha_hash          text,
  email_verificado_em timestamptz,
  criado_em           timestamptz not null default now()
);

create table contas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  criado_em timestamptz not null default now()
);

-- Lotéricas da conta (código na forma canônica, ex.: 2894). A titularidade ainda não é verificada.
create table conta_lojas (
  conta_id        uuid not null references contas (id) on delete cascade,
  loterica_codigo text not null,
  nome            text not null,
  franquia_limite numeric(12, 2) not null default 8000,
  verificada_em   timestamptz,
  criado_em       timestamptz not null default now(),
  primary key (conta_id, loterica_codigo)
);

create table membros (
  conta_id   uuid not null references contas (id) on delete cascade,
  usuario_id uuid not null references usuarios (id) on delete cascade,
  papel      text not null check (papel in ('responsavel', 'socio', 'colaborador')),
  telas      text[],   -- colaborador: telas liberadas (null = padrão do papel)
  lojas      text[],   -- colaborador: lojas liberadas (null = todas)
  criado_em  timestamptz not null default now(),
  primary key (conta_id, usuario_id)
);
create unique index membros_um_responsavel on membros (conta_id) where papel = 'responsavel';
create index membros_usuario on membros (usuario_id);

create table convites (
  id           uuid primary key default gen_random_uuid(),
  conta_id     uuid not null references contas (id) on delete cascade,
  email        text not null check (email = lower(email)),
  papel        text not null check (papel in ('socio', 'colaborador')),
  telas        text[],
  lojas        text[],
  token_hash   text not null unique,
  criado_por   uuid references usuarios (id) on delete set null,
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null,
  aceito_em    timestamptz,
  cancelado_em timestamptz
);
create index convites_conta on convites (conta_id, criado_em);

create table tokens_login (
  token_hash text primary key,
  email      text not null check (email = lower(email)),
  voltar     text,
  criado_em  timestamptz not null default now(),
  expira_em  timestamptz not null,
  usado_em   timestamptz
);
create index tokens_login_email on tokens_login (email, criado_em);

create table sessoes (
  token_hash text primary key,
  usuario_id uuid not null references usuarios (id) on delete cascade,
  conta_id   uuid references contas (id) on delete set null,
  criado_em  timestamptz not null default now(),
  expira_em  timestamptz not null,
  visto_em   timestamptz not null default now(),
  aparelho   text
);
create index sessoes_usuario on sessoes (usuario_id);
