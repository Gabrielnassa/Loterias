-- Conferência de todas as modalidades: marcações além dos números, no jogo e no resultado.

alter table bolao_jogos
  add column trevos       integer[],                                     -- +Milionária
  add column time_coracao text,                                          -- Timemania
  add column mes_sorte    smallint check (mes_sorte between 1 and 12),   -- Dia de Sorte
  add column colunas      jsonb;  -- Super Sete: dígitos por coluna; Loteca: palpites ("1", "X", "2") por jogo

alter table resultados
  add column trevos       integer[],   -- +Milionária
  add column time_coracao text,        -- Timemania (como a CAIXA escreve)
  add column mes_sorte    smallint check (mes_sorte between 1 and 12),
  add column partidas     jsonb;       -- Loteca: os 14 jogos com placar e coluna vencedora
