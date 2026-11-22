-- Configuração gerada pelo próprio sistema na 1ª subida (ex.: chaves VAPID do Web Push quando o ambiente
-- não as informa, como no Docker Manager da Hostinger, sem terminal no servidor).
create table config_sistema (
  chave     text primary key,
  valor     text not null,
  criado_em timestamptz not null default now()
);
