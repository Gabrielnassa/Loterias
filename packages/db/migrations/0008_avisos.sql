-- Fase 6: lotéricas monitoradas (watchlist), aparelhos com Web Push e central de notificações.

create table monitoradas (
  conta_id        uuid not null references contas (id) on delete cascade,
  loterica_codigo text not null,
  apelido         text,
  criado_em       timestamptz not null default now(),
  primary key (conta_id, loterica_codigo)
);
create index monitoradas_codigo on monitoradas (loterica_codigo);

-- Um aparelho = uma inscrição de Web Push (navegador/celular). Preferências por aparelho.
create table aparelhos (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references usuarios (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  nome          text,
  preferencias  jsonb not null default '{}',
  criado_em     timestamptz not null default now(),
  visto_em      timestamptz not null default now(),
  falhas        integer not null default 0,
  desativado_em timestamptz
);
create index aparelhos_usuario on aparelhos (usuario_id);

-- Central de notificações (o que chega por push também fica aqui). `chave` evita repetir o mesmo alerta.
create table notificacoes (
  id         bigserial primary key,
  usuario_id uuid not null references usuarios (id) on delete cascade,
  conta_id   uuid references contas (id) on delete cascade,
  categoria  text not null,
  titulo     text not null,
  corpo      text not null,
  url        text,
  chave      text not null,
  criado_em  timestamptz not null default now(),
  lida_em    timestamptz,
  enviadas   integer not null default 0,
  unique (usuario_id, chave)
);
create index notificacoes_usuario_em on notificacoes (usuario_id, criado_em desc);
