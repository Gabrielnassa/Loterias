-- Respostas do dono do produto (21/11/2026):
--  * T0 POR CONCURSO, com regras padrão editáveis e ajuste pela 1ª vez que um bolão aparece;
--  * modo "links públicos das lotéricas monitoradas" (colocação indisponível);
--  * estratégia de leitura na abertura (completa ou só a borda da 1ª fila).

create table regras_abertura (
  id                   serial primary key,
  chave                text not null unique,
  modalidade_id        smallint references modalidades (id),        -- null = todas
  dia_semana           smallint check (dia_semana between 1 and 7), -- dia do sorteio do concurso anterior; null = todos
  minutos_apos_sorteio integer,                                     -- T0 = sorteio anterior + N min
  hora_padrao          time,                                        -- ou T0 = este horário no dia do sorteio
  prioridade           integer not null default 50,                 -- menor = avaliada antes
  ativo                boolean not null default true,
  observacao           text,
  check (minutos_apos_sorteio is not null or hora_padrao is not null)
);

insert into regras_abertura (chave, minutos_apos_sorteio, hora_padrao, dia_semana, prioridade, observacao) values
  ('apos-sorteio', 45, null, null, 10, 'abre 45 min depois do sorteio do concurso anterior (Mega 3.089 dom 11:00 -> 3.090 abre 11:45)'),
  ('domingo-sem-hora', null, '11:45', 7, 50, 'sem hora do sorteio: domingo 11:45'),
  ('seg-sab-sem-hora', null, '21:45', null, 90, 'sem hora do sorteio: 21:45');

alter table concursos
  add column sorteio_em timestamptz,
  add column abre_em_previsto timestamptz,
  add column abre_em_origem text not null default 'regra'
    check (abre_em_origem in ('regra', 'fonte', 'primeiro_bolao', 'manual')),
  add column abre_em_regra text;
update concursos set abre_em_origem = 'manual' where origem = 'manual';

alter table aberturas
  add column escopo_colocacao text not null default 'vitrine'
    check (escopo_colocacao in ('vitrine', 'monitoradas'));

alter table coletas add column estrategia text check (estrategia in ('completa', 'borda'));
