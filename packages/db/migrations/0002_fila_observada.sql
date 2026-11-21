-- Fase 0 concluída em parte (portal inspecionado em 21/11/2026): a CAIXA informa a fila de cada
-- bolão (campo `index`), as cotas oferecidas na internet (qtdCotaDigital), o resíduo da última
-- cota e a tarifa por cota. Guardamos a fila observada E a calculada pela regra.

alter table boloes
  add column fila_calculada integer,
  add column fila_observada integer,
  add column fila_observada_entrada integer,
  add column cotas_digitais integer,
  add column contem_residuo boolean not null default false,
  add column valor_ultima_cota numeric(12, 2),
  add column tarifa_cota numeric(12, 2);

update boloes set fila_calculada = fila where fila_calculada is null;
alter table boloes alter column fila_calculada set not null;

comment on column boloes.fila is 'fila efetiva: a observada na fonte (index), se houver; senão a calculada';
comment on column boloes.fila_calculada is 'fila pela regra: ordem de first_seen_at entre os bolões da lotérica no concurso';
comment on column boloes.fila_observada is 'index informado pela fonte na leitura mais recente';
comment on column boloes.fila_observada_entrada is 'index informado pela fonte quando o bolão apareceu';

-- job de fim de janela da abertura registra a sua execução em coletas
alter table coletas drop constraint coletas_tipo_check;
alter table coletas add constraint coletas_tipo_check
  check (tipo in ('varredura', 'contagens', 'encerrar', 'concursos', 'abertura'));

-- desvio entre o relógio do servidor da fonte (dataHoraServidor) e o do coletor
alter table coletas add column desvio_servidor_ms integer;
