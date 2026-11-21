-- Radar Lotérico — schema inicial (Fase 1 + base do Raio-X da Fase 2).
-- Fonte da verdade do DDL. O schema Drizzle (schema.ts) espelha estas tabelas para consultas
-- tipadas; o particionamento de snapshots_bolao não é expressável no Drizzle, por isso SQL à mão.
-- Todos os instantes em timestamptz (UTC). Regras de calendário usam America/Sao_Paulo.

create extension if not exists pg_trgm;

-- Modalidades ------------------------------------------------------------------------------
create table modalidades (
  id                 smallserial primary key,
  slug               text not null unique,
  nome               text not null,
  cor                text,
  horario_sorteio    time,
  horario_fechamento time
);

insert into modalidades (slug, nome, cor, horario_fechamento) values
  ('mega-sena', 'Mega-Sena', '#209869', '20:00'),
  ('lotofacil', 'Lotofácil', '#930089', '20:00'),
  ('quina', 'Quina', '#260085', '20:00'),
  ('lotomania', 'Lotomania', '#f78100', '20:00'),
  ('dupla-sena', 'Dupla Sena', '#a61324', '20:00'),
  ('timemania', 'Timemania', '#00ff48', '20:00'),
  ('dia-de-sorte', 'Dia de Sorte', '#cb852b', '20:00'),
  ('super-sete', 'Super Sete', '#a8cf45', '20:00'),
  ('mais-milionaria', '+Milionária', '#2e3078', '20:00'),
  ('loteca', 'Loteca', '#fb1f00', '20:00');

-- Lotéricas (todas as vistas no MKP) -------------------------------------------------------
create table lotericas (
  id            bigserial primary key,
  codigo_caixa  text not null unique,
  nome          text not null,
  slug          text unique,
  cidade        text not null,
  uf            char(2) not null,
  bairro        text,
  lat           double precision,
  lng           double precision,
  first_seen_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index lotericas_uf_cidade on lotericas (uf, cidade);
-- busca por texto (nome, cidade, código)
create index lotericas_busca_trgm on lotericas
  using gin ((lower(nome) || ' ' || lower(cidade) || ' ' || codigo_caixa) gin_trgm_ops);

-- Concursos ---------------------------------------------------------------------------------
create table concursos (
  id              bigserial primary key,
  modalidade_id   smallint not null references modalidades (id),
  numero          integer not null,
  data_sorteio    date,
  abre_em         timestamptz,          -- T0 da abertura (base do Raio-X); ajustável por concurso
  fecha_em        timestamptz,
  premio_estimado numeric(16, 2),
  acumulado       boolean,
  especial        boolean not null default false,
  encerrado_em    timestamptz,
  origem          text not null default 'fonte',  -- fonte | previsao | manual
  unique (modalidade_id, numero)
);
create index concursos_abre_em on concursos (abre_em);
create index concursos_abertos on concursos (fecha_em) where encerrado_em is null;

-- Bolões -----------------------------------------------------------------------------------
create table boloes (
  id                      bigserial primary key,
  id_caixa                text not null unique,
  loterica_id             bigint not null references lotericas (id),
  concurso_id             bigint not null references concursos (id),
  jogos                   smallint not null check (jogos > 0),
  dezenas                 smallint not null check (dezenas > 0),
  cotas_total             integer not null check (cotas_total > 0),
  valor_cota              numeric(12, 2) not null,  -- valor BASE da cota, sem tarifa
  valor_cota_exibido      numeric(12, 2),           -- com tarifa, se a fonte informar
  valor_aposta            numeric(14, 2) not null,  -- valor total das apostas = cotas_total x valor_cota
  cotas_disponiveis       integer not null check (cotas_disponiveis >= 0),
  first_seen_at           timestamptz not null,
  last_seen_at            timestamptz not null,
  fila                    integer not null check (fila > 0),
  ordem_primeira_leitura  integer,
  -- colocação na ENTRADA: observada (ordem da fonte) e calculada (regra), guardamos as duas
  pos_entrada_brasil      integer,
  pos_entrada_uf          integer,
  pos_entrada_cidade      integer,
  pos_entrada_calc_brasil integer not null,
  pos_entrada_calc_uf     integer not null,
  pos_entrada_calc_cidade integer not null,
  empate_entrada          boolean not null default false,
  status                  text not null default 'a_venda'
                            check (status in ('a_venda', 'esgotado', 'encerrado', 'estornado')),
  esgotou_em              timestamptz,
  sobra_final             integer,
  estornado               boolean not null default false,
  estornado_em            timestamptz,
  check (cotas_disponiveis <= cotas_total)
);
create index boloes_concurso_first_seen on boloes (concurso_id, first_seen_at);
create index boloes_loterica_concurso on boloes (loterica_id, concurso_id);

create table bolao_jogos (
  bolao_id bigint not null references boloes (id) on delete cascade,
  ordem    smallint not null,
  numeros  integer[] not null,
  primary key (bolao_id, ordem)
);

-- Snapshots brutos (particionada por dia; retenção fina de 90 dias) ------------------------
-- Para não explodir o volume, o coletor grava linha quando o bolão é novo, quando muda
-- (disponíveis/status) e em "keyframes" periódicos; a tabela coletas registra cada leitura,
-- então o estado em qualquer instante é recalculável (última linha <= t de cada bolão).
create table snapshots_bolao (
  coletado_em       timestamptz not null,
  bolao_id          bigint not null,
  cotas_disponiveis integer not null,
  presente          boolean not null default true,  -- false = sumiu da vitrine
  posicao_brasil    integer,
  posicao_uf        integer,
  posicao_cidade    integer,
  coleta_id         bigint,
  primary key (bolao_id, coletado_em)
) partition by range (coletado_em);
create table snapshots_bolao_default partition of snapshots_bolao default;

-- Cria as partições diárias [dia, dia + 1) em UTC para `dias` dias a partir de `inicio`.
create or replace function garantir_particoes_snapshots(inicio date, dias integer)
returns integer language plpgsql as $$
declare
  d date;
  nome text;
  criadas integer := 0;
begin
  for i in 0 .. dias - 1 loop
    d := inicio + i;
    nome := 'snapshots_bolao_p' || to_char(d, 'YYYYMMDD');
    if to_regclass(nome) is null then
      execute format(
        'create table %I partition of snapshots_bolao for values from (%L) to (%L)',
        nome, (d::timestamp at time zone 'UTC'), ((d + 1)::timestamp at time zone 'UTC'));
      criadas := criadas + 1;
    end if;
  end loop;
  return criadas;
end $$;

-- Remove partições diárias anteriores a hoje − `manter_dias` (retenção fina).
create or replace function remover_particoes_snapshots(manter_dias integer)
returns integer language plpgsql as $$
declare
  r record;
  removidas integer := 0;
  limite date := (now() at time zone 'UTC')::date - manter_dias;
begin
  for r in
    select c.relname from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_class p on p.oid = i.inhparent
    where p.relname = 'snapshots_bolao' and c.relname ~ '^snapshots_bolao_p\d{8}$'
  loop
    if to_date(substring(r.relname from 18 for 8), 'YYYYMMDD') < limite then
      execute format('drop table %I', r.relname);
      removidas := removidas + 1;
    end if;
  end loop;
  return removidas;
end $$;

select garantir_particoes_snapshots((now() at time zone 'UTC')::date - 1, 9);

-- Eventos derivados ------------------------------------------------------------------------
create table eventos_bolao (
  id         bigserial primary key,
  bolao_id   bigint not null references boloes (id),
  tipo       text not null
               check (tipo in ('bolao_novo', 'venda', 'devolucao', 'esgotou', 'encerrou', 'estorno')),
  em         timestamptz not null,
  quantidade integer,
  inferido   boolean not null default false,
  coleta_id  bigint
);
create index eventos_bolao_bolao_em on eventos_bolao (bolao_id, em);
create index eventos_bolao_tipo_em on eventos_bolao (tipo, em);

-- Saúde do coletor --------------------------------------------------------------------------
create table coletas (
  id           bigserial primary key,
  tipo         text not null check (tipo in ('varredura', 'contagens', 'encerrar', 'concursos')),
  modo         text not null check (modo in ('normal', 'abertura')),
  modalidade   text,
  concurso     integer,
  slot         bigint,
  agendada_para timestamptz,
  iniciou_em   timestamptz not null,
  terminou_em  timestamptz,
  itens        integer,
  paginas      integer,
  completa     boolean,
  novos        integer,
  eventos      integer,
  erro         text
);
create index coletas_iniciou_em on coletas (iniciou_em desc);
create index coletas_concurso on coletas (modalidade, concurso, iniciou_em desc);
create index coletas_erros on coletas (iniciou_em desc) where erro is not null;

-- Mercado por minuto (uf = 'BR' é o total) ---------------------------------------------------
create table mercado_minuto (
  concurso_id   bigint not null references concursos (id),
  modalidade_id smallint not null references modalidades (id),
  uf            char(2) not null,
  minuto        timestamptz not null,
  boloes        integer not null,
  cotas         integer not null,
  lotericas     integer not null,
  valor         numeric(16, 2) not null,
  primary key (concurso_id, uf, minuto)
);
create index mercado_minuto_modalidade on mercado_minuto (modalidade_id, uf, minuto);

-- Aberturas e participações (base do Raio-X) -------------------------------------------------
create table aberturas (
  id               bigserial primary key,
  concurso_id      bigint not null unique references concursos (id),
  t0               timestamptz not null,
  janela_min       smallint not null default 60,
  participacao_min smallint not null default 30,
  processada_em    timestamptz
);
create index aberturas_t0 on aberturas (t0);

create table abertura_participacoes (
  abertura_id       bigint not null references aberturas (id) on delete cascade,
  loterica_id       bigint not null references lotericas (id),
  primeiro_bolao_id bigint not null references boloes (id),
  primeiro_em       timestamptz not null,
  atraso_s          numeric(9, 3) not null,
  n_boloes_1h       integer not null,
  pos_cidade        integer not null,
  pos_uf            integer not null,
  pos_brasil        integer not null,
  pagina_cidade     integer not null,
  pagina_uf         integer not null,
  pagina_brasil     integer not null,
  valor_1h          numeric(14, 2) not null,
  pct_vendido       numeric(6, 5),
  sobra             numeric(14, 2),
  empate            boolean not null default false,
  primary key (abertura_id, loterica_id)
);
create index abertura_participacoes_loterica on abertura_participacoes (loterica_id, abertura_id);

-- Franquia diária ---------------------------------------------------------------------------
create table franquia_diaria (
  loterica_id bigint not null references lotericas (id),
  dia         date not null,
  limite      numeric(12, 2),
  usado       numeric(12, 2) not null default 0,
  primary key (loterica_id, dia)
);
