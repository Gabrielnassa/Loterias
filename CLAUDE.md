# CLAUDE.md — Radar Lotérico

Sistema para lotéricas que lê a vitrine pública do Marketplace de Bolões da CAIXA e transforma as
leituras em gestão, inteligência competitiva (Raio-X de Abertura) e marketing. A especificação
completa está em `SPEC.md` (não editar; é a referência). Reproduza as funções, **nunca** a marca,
os textos, as artes ou o código do oLoterico.

## Mapa do repositório

| Caminho | O que é |
| --- | --- |
| `packages/core` | Regras de negócio **puras** (sem banco, sem rede): fila, posição, página, financeiro, franquia, eventos, plano de coleta, participação na abertura, Raio-X. Tudo testado. |
| `packages/core/fonte` | Contrato do adaptador da fonte, validação (zod), varredura, cliente HTTP educado, saúde, adaptadores (fixture, CAIXA em esqueleto) e fixtures sintéticas |
| `packages/core/simulacao` | Simulador de abertura com "verdade" conhecida + `FonteSimulada` |
| `packages/db` | DDL em SQL (`migrations/`, fonte da verdade), espelho Drizzle (`schema.ts`), migrador, partições |
| `apps/worker` | Coletor contínuo: relógio NTP, agendador ao segundo, fila BullMQ (ou memória), coletor, repositórios Postgres/memória |
| `docs/fonte-caixa.md` | Fase 0: o que falta descobrir sobre a fonte e como capturar um HAR |

## Comandos

```bash
pnpm install
pnpm test                 # todos os pacotes (integração com banco é pulada sem DATABASE_URL_TESTE)
pnpm typecheck
DATABASE_URL_TESTE=postgres://postgres@localhost:5432/postgres pnpm test   # inclui integração (cria/apaga radar_teste_db e radar_teste_worker)
pnpm --filter @radar/core test                                            # só as regras
FONTE=fixture pnpm poc:fonte                                              # PoC: baixa 3 páginas da fonte
FILA=memoria REPOSITORIO=memoria FONTE=simulada pnpm worker:dev           # worker sem Redis/Postgres
docker compose up -d postgres redis && docker compose up -d --build worker
pnpm --filter @radar/core exec tsx fonte/fixtures/gerar.ts                # regenera fixtures sintéticas
```

## Convenções

- Domínio em português (nomes de arquivos, tipos, funções, mensagens). Código TypeScript estrito.
- **Regra nova = função pura em `packages/core` + teste.** O worker só orquestra e persiste.
- Banco em UTC (`timestamptz`); regras de calendário em `America/Sao_Paulo` via `core/tempo/fuso.ts`
  (nunca usar o fuso da máquina). Semana = segunda a domingo.
- Dinheiro arredondado a centavos com `centavos()`; valor de cota guardado SEM tarifa (`valor_cota`).
- DDL só em `packages/db/migrations/NNNN_*.sql`; atualizar `schema.ts` junto (o teste de integração
  compara as colunas). Em SQL cru do Drizzle, passar datas como ISO string + cast.
- Fonte: só pelo `ClienteHttpEducado` (limite, backoff, para em 401/403/captcha). Nunca burlar bloqueio.
  Alerta após 3 falhas seguidas ou mudança de formato (`MonitorSaudeFonte`).
- LGPD: nunca coletar dados de apostadores. HAR (`*.har`, `docs/har/`) nunca vai para o git.
- Números de terceiros (vendas, sobras, colocação) são estimativas a partir de snapshots: a UI
  deve avisar.

## Glossário do domínio (SPEC)

| Termo | Definição operacional | Exemplo observado |
| --- | --- | --- |
| Marketplace (MKP) | Vitrine online da CAIXA (portal e app Loterias CAIXA, desde 20/05/2024) onde as lotéricas põem cotas de Bolão CAIXA à venda | 149.308 bolões de 8.466 lotéricas à venda |
| Abertura | Momento em que um concurso novo passa a aceitar bolões no MKP | 21:45 de segunda a sábado; 11:45 no domingo |
| Velocidade na abertura | Horário do 1º bolão da lotérica na abertura | rápido 21:46, médio 21:47, lento 21:48 ou depois |
| Fila | O 1º bolão de cada lotérica forma a 1ª fila, o 2º a 2ª fila, e assim por diante. A vitrine mostra a 1ª fila inteira antes da 2ª; dentro da fila vale a ordem de chegada | Mega-Sena 3.089: 26 filas, 1ª fila nas págs. 1 a 70 |
| Página | 30 bolões por página: página = teto(posição / 30) | "zona quente" = págs. 1 e 2 |
| Colocação | Posição do bolão na vitrine por escopo: cidade, estado (UF) e Brasil | São Paulo pág 4, 117º; SP pág 7, 185º; Brasil pág 11, 311º |
| Franquia diária | Teto em R$ (valor sem tarifa) que a lotérica pode subir por dia, janela 05:00 a 23:00 | R$ 8.000 |
| Tarifa | 35% sobre o valor base das cotas vendidas pela internet; é a receita da lotérica | |
| Comissão | 8,61% pagos pela CAIXA sobre as apostas dos bolões que venderam ao menos uma cota | |
| Sobra (encalhe) | Cotas não vendidas até o fechamento; viram custo pelo valor da aposta | |
| Balcão (impresso) | Cotas vendidas no TFL; contam como vendidas, sem sobra | |
| Lucro | tarifa - sobras + comissão | |
| Break-even | % de cotas que precisa vender para empatar | 8,6% (ver "Questões em aberto") |
| Código do bolão | jogos, dezenas, cotas | 6J-17D-40C = 6 jogos de 17 dezenas, 40 cotas |
| Estorno | Bolão cancelado; o usuário marca e desmarca manualmente | |
| TFL | Terminal Financeiro Lotérico | |

## Motor de dados: regras de cálculo (SPEC)

Tudo deriva de snapshots periódicos da vitrine pública. Venda, sobra, velocidade e colocação são
diferenças entre snapshots, nunca dados oficiais; a frequência da coleta define a precisão.

- **Fila** = ordem do bolão entre os bolões da mesma lotérica no concurso, por first_seen_at.
- **Posição no escopo** (cidade, UF, Brasil) = ordenar os bolões visíveis do escopo por
  (fila, first_seen_at) e pegar o índice. Se a fonte já devolver a ordem da vitrine, usar o índice
  observado e guardar os dois.
- **Página** = teto(posição / 30).
- **Colocação na abertura** = posição no momento em que o bolão entrou (não a atual).
- **Tarifa** = 35% × valor base × cotas vendidas; **comissão** = 8,61% × apostas dos bolões com ao
  menos uma cota vendida; **sobra** = cotas sobradas × valor da aposta por cota;
  **lucro** = tarifa − sobras + comissão.
- **Franquia usada** = soma do valor sem tarifa dos bolões inseridos entre 05:00 e 23:00.

Modos de coleta: **Normal** (o dia todo: contagens a cada 60 s; varredura completa a cada 5-10 min
por concurso) e **Abertura** (T0 − 1 min até T0 + 60 min; 5 s nos primeiros 15 min, depois 15 s;
só o concurso recém-aberto). T0 = 21:45 seg-sáb, 11:45 dom, configurável por concurso
(`concursos.abre_em`).

Eventos de cada par de snapshots: `bolao_novo` (grava first_seen_at, posição observada e fila),
`venda` (disponíveis diminuíram), `esgotou` (disponíveis = 0 ou sumiu antes do fechamento),
`encerrou` (sobra = disponíveis no último snapshot antes do fechamento), `estorno` (manual).

### Como está implementado (onde e decisões)

| Regra | Onde | Decisão de implementação |
| --- | --- | --- |
| Fila | `core/regras/fila.ts`, `core/eventos/estado.ts` | Estática (atribuída na entrada). Empate na mesma leitura: ordem da fonte, depois id |
| Posição atual | `calcularPosicoes` | Escopos normalizados sem acento; cidade qualificada pela UF |
| Posição observada | `posicoesObservadas` | Brasil = índice na resposta; UF/cidade = índice no escopo dentro da mesma leitura (a varredura sempre lê um prefixo contíguo) |
| Colocação na entrada | `posicoesNaEntrada` (O(n·filas)) e `aplicarLeitura` | Grava observada e calculada (`boloes.pos_entrada_*` e `pos_entrada_calc_*`); a participação usa a observada se houver |
| first_seen_at | `aplicarLeitura` | Instante em que a página com o bolão foi obtida (nunca antes da chegada real). Se a fonte informar a hora de inserção, usa ela |
| Sumiu = esgotou | `aplicarLeitura` | Só em leitura COMPLETA e após 2 leituras completas seguidas sem o bolão; data = 1ª ausência; eventos marcados `inferido` |
| Devolução | `aplicarLeitura` | Evento extra `devolucao` quando disponíveis aumentam (não previsto na SPEC) |
| Financeiro | `core/regras/financeiro.ts` | Balcão conta como vendida e libera comissão, mas não gera tarifa de internet; estornado zera tudo |
| Franquia | `core/regras/franquia.ts` | Janela [05:00, 23:00) em SP; estornados contam por padrão (opção para não contar) |
| Plano de coleta | `core/coleta/plano.ts` | Slots alinhados a T0 − 1 min; tarefa só sai quando o slot avança; atrasos não acumulam (slot perdido é contado) |
| Snapshots | `aplicarLeitura` + `snapshots_bolao` | Grava linha do bolão novo, do que mudou, do que sumiu (`presente=false`) e keyframe de todos a cada 10 min; cada leitura fica em `coletas` |
| Mercado | `core/mercado/agregar.ts` | `mercado_minuto` por concurso, UF e 'BR' (total) |

## Raio-X de Abertura: definições (SPEC)

- **Abertura**: janela de um concurso novo, de T0 (`concursos.abre_em`) até T0 + 60 min; uma noite
  pode ter várias (uma por modalidade); mostrar por modalidade e consolidado por dia.
- **Participou**: ao menos 1 bolão com first_seen_at entre T0 e T0 + 30 min (configurável).
- **Horário de entrada**: first_seen_at do 1º bolão; atraso = segundos desde T0.
- **Colocação**: posição desse 1º bolão no momento em que entrou, nos 3 escopos, com a página.
- **Semana**: segunda a domingo, fuso America/Sao_Paulo.

Métricas: aberturas na semana (participações / aberturas ocorridas); dias que abriu; hora do 1º
bolão; atraso mediano; melhor colocação (mín. pos_uf); colocação mediana; % na página 1; volume na
1ª hora (n_boloes_1h, valor_1h); resultado (% vendido e sobra); tendência (semana atual × média das
4 anteriores); chance de abrir amanhã (frequência naquele dia da semana nas últimas 8 semanas).

Precisão: com leitura a cada 5 s o erro máximo é 5 s; empates na mesma leitura usam a ordem da
fonte e ficam marcados. O histórico só começa quando o coletor entrar no ar.

### Como está implementado

| Item | Onde | Decisão |
| --- | --- | --- |
| Participação | `core/abertura/participacao.ts` | Intervalos fechados [T0, T0+30 min] e [T0, T0+60 min]; estornados não contam; `sobra` em R$ (valor base) só depois do encerramento |
| Métricas semanais | `core/raio-x/semanal.ts` (`metricasSemanais`) | Escopo selecionável (default UF); medianas = `percentile_cont(0.5)` |
| Grade (tela 1) | `gradeSemanal` | 7 colunas seg..dom; com modalidade "todas" a célula mostra a MELHOR colocação do dia (empate: menor atraso); faixas pag1 / pag2-3 / pag4+ |
| Tendência | `tendencia` | Semana atual (pode ser parcial, sinalizado) × média das 4 anteriores |
| Chance de abrir | `chanceDeAbrir` | Só conta semanas em que houve abertura naquele dia da semana |
| Ranking (tela 4) | `core/raio-x/ranking.ts` | Critérios: mais aberturas, mais rápida (atraso mediano), mais pág. 1 |
| Comparar (tela 3) | `compararLotericas` | Até 6 lotéricas; "primeiro do dia" = menor atraso, empate pela colocação |
| Ao vivo (tela 5) | `ordemDeChegada` | Ordem por primeiro_em; filtro por UF/cidade |

## Questões em aberto (decidir com o dono do produto)

1. **Break-even**: com lucro = tarifa − sobra + comissão, o empate exige vender
   (1 − 0,0861) / 1,35 ≈ **67,7%** das cotas, não 8,6% como no exemplo do glossário. O código usa a fórmula.
2. **Tarifa no balcão**: a SPEC só fala em tarifa nas vendas pela internet; implementado assim.
3. **Precisão após T0 + 15 min**: o critério de aceite pede erro ≤ 5 s em toda abertura, mas o
   modo abertura lê a cada 15 s depois dos 15 min (erro até 15 s para quem entra entre 15 e 30 min).
   Configurável: `COLETA_ABERTURA_RAPIDA_MIN=30` mantém 5 s até o limite de participação.
4. **Fila estática x dinâmica** e demais perguntas da fonte: ver `docs/fonte-caixa.md`.
5. **Quais modalidades abrem no domingo às 11:45** (o default prevê a próxima abertura no T0 do dia do
   sorteio do concurso atual; `abre_em` pode ser corrigido por concurso).
6. Preços/dias de sorteio em `core/dominio/modalidades.ts` são referência para simulação; confirmar no
   Manual de Produtos.
