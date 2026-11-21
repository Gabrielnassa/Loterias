-- Fase 5: site público de cada lotérica (/{slug}) e métricas de acesso.

create table sites (
  id            bigserial primary key,
  loterica_id   bigint not null unique references lotericas (id),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  whatsapp      text,              -- só dígitos, com DDI e DDD (ex.: 5511999990000)
  instagram     text,              -- usuário, sem @
  endereco      text,
  horario       text,
  sobre         text,
  tema          text not null default 'classico' check (tema in ('classico', 'noite', 'sorte')),
  link_caixa    text,              -- sobrescreve o link público padrão da lotérica no portal da CAIXA
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- LGPD: nenhum dado pessoal. `visitante` é um id aleatório gerado no navegador (sem IP, sem cookie de terceiros).
create table site_eventos (
  id        bigserial primary key,
  site_id   bigint not null references sites (id) on delete cascade,
  em        timestamptz not null default now(),
  tipo      text not null check (tipo in ('visita', 'whatsapp', 'caixa', 'carrinho')),
  visitante text not null check (length(visitante) <= 64),
  bolao_id  text
);
create index site_eventos_site_em on site_eventos (site_id, em);
