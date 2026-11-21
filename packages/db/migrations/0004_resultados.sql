-- Fase 3 (Conferência MKP): resultado e rateio oficiais por concurso.
create table resultados (
  concurso_id   bigint primary key references concursos (id) on delete cascade,
  data_apuracao date not null,
  dezenas       integer[] not null,
  dezenas2      integer[],                 -- 2º sorteio (Dupla Sena)
  acumulado     boolean not null default false,
  origem        text not null default 'caixa' check (origem in ('caixa', 'seed')),
  obtido_em     timestamptz not null default now(),
  bruto         jsonb                      -- JSON original da CAIXA (auditoria)
);

create table rateios (
  concurso_id  bigint not null references resultados (concurso_id) on delete cascade,
  faixa        smallint not null,
  descricao    text not null,
  acertos      smallint,
  ganhadores   integer not null,
  valor_premio numeric(16, 2) not null,
  primary key (concurso_id, faixa)
);

-- estorno manual pela tela Bolões MKP
create index boloes_estornados on boloes (loterica_id) where estornado;
