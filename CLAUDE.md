# CLAUDE.md — Radar Lotérico

Sistema para lotéricas que lê a vitrine pública do Marketplace de Bolões da CAIXA e transforma as
leituras em gestão, inteligência competitiva (Raio-X de Abertura) e marketing. A especificação
completa está em `SPEC.md` (não editar; é a referência). Reproduza as funções, **nunca** a marca,
os textos, as artes ou o código do oLoterico.

## Mapa do repositório

| Caminho | O que é |
| --- | --- |
| `packages/core` | Regras de negócio **puras** (sem banco, sem rede): fila, posição, página, financeiro, franquia, eventos, plano de coleta, participação na abertura, Raio-X. Tudo testado. |
| `packages/core/fonte` | Contrato do adaptador da fonte, validação (zod), varredura, cliente HTTP educado, saúde, contrato do JSON bruto da CAIXA (`caixa-bruto.ts`) e fixtures |
| `packages/core/simulacao` | Simulador de abertura com "verdade" conhecida, `FonteSimulada`, coletor rápido, histórico simulado (800 lotéricas, 13 semanas) e JSON no formato bruto da CAIXA |
| `packages/db` | DDL em SQL (`migrations/`, fonte da verdade), espelho Drizzle (`schema.ts`), migrador, partições |
| `apps/worker` | Coletor contínuo: relógio NTP, agendador ao segundo, fila BullMQ (ou memória), coletor, job de fim de janela, repositórios Postgres/memória, adaptador `caixa-navegador` (Playwright) |
| `apps/web` | Next.js 15 + Tailwind. Painel no grupo de rotas `app/(painel)` (com menu); site público da lotérica em `app/(site)/[slug]` (layout próprio, 3 temas, SEO local, sitemap/robots só com os sites); artes PNG em `lib/artes.ts` (Satori + resvg, fonte Inter em `assets/fontes`). Telas do Raio-X, da Minha lotérica (`/minha`: Bolões, Financeiro, Conferência, Posição na abertura, Sugestões, Simulador de posição, Cronômetro, Meu site, Mídias) e do Mercado (`/mercado`, `/mercado/filas`, `/estatisticas`, `/estatisticas/lotericas/[codigo]`, `/mega-da-virada`; dados em `lib/mercado.ts`), API, busca, CSV/Excel, SSE ao vivo, gráficos em SVG no servidor (`components/Grafico.tsx`). Lê do Postgres (`lib/dados-postgres.ts`, `lib/minha.ts`) ou da simulação (`lib/dados.ts`); escolha em `lib/fonte-dados.ts` |
| `packages/core/mercado` | Fase 4: retrato da vitrine num instante e série por varredura de eventos (`vitrine.ts`), filas (`filas.ts`), panorama, ficha da lotérica e top 10 (`estatisticas.ts`); a simulação entra por `simulacao/mercado-simulado.ts` (inclui uma Mega da Virada simulada) |
| `packages/core/minha`, `packages/core/conferencia` | Regras da Fase 3: financeiro por bolão (internet x balcão), resumo dia a dia, break-even por concurso, posição na abertura 7/30/90 dias, resultado oficial e prêmios das 10 modalidades |
| `packages/core/contas` | Fase 6: papéis, telas e rotas (`TELAS`, `classificarRota`), permissões, convites, regras de senha e link |
| `apps/web/lib/contas` | Repositório de contas (Postgres e memória), sessão/contexto, fluxos de acesso (`acesso.ts`, só servidor) e de equipe (`equipe.ts`, roda também na demo); `apps/web/middleware.ts` é o porteiro |
| `packages/avisos` | Fase 6: monitoradas, aparelhos (Web Push VAPID) e central de notificações: repositório (Postgres e memória), `despachar`, `push.ts` (web-push) e `gerar.ts` (alertas do worker a partir do banco) |
| `packages/db/seed.ts` | Seed de demonstração: grava o histórico simulado no banco com `concursos.origem = 'seed'` (a web avisa "dados simulados") |
| `docs/fonte-caixa.md` | Fase 0: API observada no portal, respostas e o que falta descobrir |
| `docs/observacoes/` | Resumos de observações reais (só agregados; o repositório é PÚBLICO: nada de nomes de lotéricas nem fotos completas) |
| `apps/demo` | Demonstração estática (GitHub Pages): as mesmas telas do `apps/web` rodando no navegador com o histórico simulado gerado no build |
| `docs/proximos-passos.md` | Ponto de retomada entre sessões |

## Comandos

```bash
pnpm install
pnpm test                 # todos os pacotes (integração com banco é pulada sem DATABASE_URL_TESTE)
pnpm typecheck
DATABASE_URL_TESTE=postgres://postgres@localhost:5432/postgres pnpm test   # inclui integração (cria/apaga radar_teste_db e radar_teste_worker)
pnpm --filter @radar/core test                                            # só as regras
FONTE=fixture pnpm poc:fonte                                              # PoC: baixa 3 páginas da fonte
FILA=memoria REPOSITORIO=memoria FONTE=simulada pnpm worker:dev           # worker sem Redis/Postgres
pnpm web:dev                                                              # web em http://localhost:3000 (simulação; com DATABASE_URL lê do banco)
DATABASE_URL=... pnpm db:seed                                             # grava o histórico simulado no banco (apaga só o seed com -- --limpar)
pnpm caixa:preparar-sessao                                                # UMA PESSOA prepara a sessão do navegador
FONTE=caixa-navegador CAIXA_MODALIDADES=mega-sena pnpm poc:fonte          # adaptador real (exige a sessão)
pnpm observar-abertura -- --modalidade mega-sena --t0 2026-11-22T11:45    # registra uma abertura real em JSONL (README)
pnpm analisar-abertura -- apps/worker/observacoes/arquivo.jsonl           # mede a ordem dentro da fila e recomenda VITRINE_ORDEM
pnpm demo:build                                                           # demonstração estática em apps/demo/out (basePath /Loterias)
pnpm resultados -- --modalidade mega-sena --concurso 3088                 # resultado oficial (grava com DATABASE_URL); atrás de proxy: NODE_USE_ENV_PROXY=1
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
- Fonte: só pelo `ClienteHttpEducado` ou pelo adaptador `caixa-navegador` (ritmo baixo, backoff, para em
  401/403/captcha). Nunca burlar bloqueio. Alerta após 3 falhas seguidas ou mudança de formato (`MonitorSaudeFonte`).
- **Nunca** reproduzir, contornar ou decifrar o parâmetro `q` da CAIXA (cifrado pelo site): só ler as respostas
  que o próprio site pede, num navegador real.
- **Nunca** responder automaticamente "Você tem mais de 18 anos?" ou termos de uso, nem fazer login: uma
  pessoa prepara a sessão (`pnpm caixa:preparar-sessao`). Nunca usar a conta pessoal de ninguém.
- Sessão do navegador (`.sessao-caixa/`) e HAR nunca vão para o git.
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
| Tarifa | 35% sobre o valor base das cotas vendidas, pela internet e no balcão (impressos); é a receita da lotérica | impressos de R$ 29,15 geraram R$ 7,55 de tarifa |
| Comissão | 8,61% pagos pela CAIXA sobre as apostas dos bolões que venderam ao menos uma cota | |
| Sobra (encalhe) | Cotas não vendidas até o fechamento; viram custo pelo valor da aposta | |
| Balcão (impresso) | Cotas vendidas no TFL; contam como vendidas (geram tarifa), sem sobra | |
| Lucro | tarifa - sobras + comissão | |
| Break-even | Quantas cotas ainda faltam vender (e que % do total precisa estar vendido) para o lucro do grupo de bolões chegar a zero | 2 bolões de Timemania de 8 cotas, um esgotado e outro 0/8: faltam 3 cotas; um bolão sozinho: ≈ 67,7%. O "8,6%" antigo era a comissão de 8,61% |
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
por concurso) e **Abertura** (T0 − 1 min até T0 + 60 min; **5 s até T0 + 30 min** — a janela que conta
como participação — e 15 s até T0 + 60 min; só o concurso recém-aberto). Quando a leitura completa passa
de 5 s, lê só as páginas onde termina a 1ª fila (é lá que entra o 1º bolão de cada lotérica), com uma
leitura completa a cada 60 s. **T0 é por concurso** (`concursos.abre_em`): previsto pela tabela editável
`regras_abertura` (padrão: 45 min depois do sorteio do concurso anterior; sem hora do sorteio, 21:45 ou
11:45 no domingo) e ajustado pela 1ª vez que um bolão do concurso aparece. Nada de horário fixo no código.

Eventos de cada par de snapshots: `bolao_novo` (grava first_seen_at, posição observada e fila),
`venda` (disponíveis diminuíram), `esgotou` (disponíveis = 0 ou sumiu antes do fechamento),
`encerrou` (sobra = disponíveis no último snapshot antes do fechamento), `estorno` (manual).

### Como está implementado (onde e decisões)

| Regra | Onde | Decisão de implementação |
| --- | --- | --- |
| Fila | `core/regras/fila.ts`, `core/eventos/estado.ts` | **Efetiva = `index` da CAIXA (fila observada)** quando vem; a calculada (ordem de first_seen_at na lotérica) é sempre guardada (`fila_calculada`). `fila_observada_entrada` x `fila_observada` revela se a fila é dinâmica |
| Posição atual | `calcularPosicoes` | Escopos normalizados sem acento; cidade qualificada pela UF |
| Posição observada | `posicoesObservadas` | Só quando a fonte declara a ordem da vitrine Brasil. A lista da CAIXA é por cidade do comprador (→ UF → Brasil), então o adaptador real manda `ordemDaVitrine=false` e vale a colocação calculada |
| Escopos da vitrine | `core/fonte/escopos.ts`, `caixa-navegador` (`CAIXA_ESCOPOS`) | Foto real de SP (21/11/2026): cidade do comprador → resto do estado (nova numeração e novo total) → resto do Brasil (presumido). O adaptador numera as páginas globalmente, marca o escopo de cada uma (`PaginaBoloes.escopo`, `haMais`) e só passa da cidade com `CAIXA_ESCOPOS=estado` ou `brasil` (padrão `cidade`) |
| Ordem dentro da fila | `core/regras/ordem-vitrine.ts`, `VITRINE_ORDEM` | **Hipótese plugável**: `fila-chegada` (padrão, SPEC) ou `fila-aleatoria` (a fila define o bloco; dentro dele vale a posição esperada, o meio do bloco). A foto real teve quedas de fila (Mega 41/542) e o número do bolão sem relação com a posição; `pnpm analisar-abertura` decide com uma gravação (Spearman entre posição e chegada na 1ª fila) |
| Calibração real | `core/mercado/referencias.ts` | Foto de SP: % vendido por faixa de preço COM tarifa, bolões por fila, formatos comuns. A simulação vende por essa curva (~36% a 72% da janela na Mega, antes ~70%) e as Sugestões mostram a coluna "Real SP*" |
| Colocação na entrada | `posicoesNaEntrada` (O(n·filas)) e `aplicarLeitura` | Grava observada e calculada (`boloes.pos_entrada_*` e `pos_entrada_calc_*`); a participação usa a observada se houver |
| first_seen_at | `aplicarLeitura` | Instante em que a página com o bolão foi obtida (nunca antes da chegada real). Se a fonte informar a hora de inserção, usa ela |
| Sumiu = esgotou | `aplicarLeitura` | Só em leitura COMPLETA e após 2 leituras completas seguidas sem o bolão; data = 1ª ausência; eventos marcados `inferido` |
| Devolução | `aplicarLeitura` | Evento extra `devolucao` quando disponíveis aumentam (não previsto na SPEC) |
| Financeiro | `core/regras/financeiro.ts` | Tarifa por cota **truncada** em centavos (portal: 20,16 → 7,05; impressos 5 × 4,32 → 7,55) ou a informada pela fonte (a tarifa é "até 35%": na foto de SP, 33,60 → 11,75 em vez de 11,76); resíduo da última cota em `valorDasApostas`. Balcão conta como vendida, gera tarifa e libera comissão; estornado zera tudo |
| Break-even | `breakEvenGrupo` | Em cotas que ainda faltam e em % do total, somando o grupo (ex.: seus bolões de uma loteria). Guloso: a 1ª cota de um bolão sem vendas também libera a comissão dele |
| Franquia | `core/regras/franquia.ts` | Janela [05:00, 23:00) em SP; estornados NÃO contam por padrão (dúvida aberta; `contarEstornados`) |
| Plano de coleta | `core/coleta/plano.ts` | Slots alinhados a T0 − 1 min; tarefa só sai quando o slot avança; atrasos não acumulam (slot perdido é contado) |
| Estratégia de leitura | `core/coleta/estrategia.ts` + `lerPaginas` | Completa enquanto couber em 5 s; senão só a borda da 1ª fila (+1 página), completa a cada 60 s; `coletas.estrategia` registra qual foi |
| T0 por concurso | `core/coleta/calendario.ts`, tabela `regras_abertura` | `preverAbertura` pelas regras ativas (menor prioridade primeiro); `ajustarT0` = minuto cheio do 1º bolão se o concurso foi visto vazio até 5 min antes e a previsão errou por mais de 2 min; T0 manual nunca muda (`abre_em_origem`, `abre_em_previsto`) |
| Snapshots | `aplicarLeitura` + `snapshots_bolao` | Grava linha do bolão novo, do que mudou, do que sumiu (`presente=false`) e keyframe de todos a cada 10 min; cada leitura fica em `coletas` |
| Mercado | `core/mercado/agregar.ts` | `mercado_minuto` por concurso, UF e 'BR' (total) |
| Monitoramento MKP | `core/mercado/vitrine.ts` (`retratoMercado`, `serieMercado`) | Bolão = entrada + mudanças de cotas (snapshots_bolao) + saída. Venda = queda de disponíveis; sumir = esgotar (vende o resto); no fechamento o resto sai sem venda. Ticket médio = valor base médio da cota à venda; Δ 5 min no intervalo (t − 5 min, t]; ritmo = cotas vendidas por minuto nos últimos 15 min. Retrato = o mesmo cálculo num instante passado; concurso fechado mostra o último retrato antes do fechamento |
| Filas MKP | `core/mercado/filas.ts` (`resumoFilasMercado`) | Ordem da vitrine (fila, entrada); páginas de cada fila só com os que estão à venda; "mais vende" = maior % vendido com ≥ 3 bolões; faixas de cota (a, b] com "sobra relativa" à faixa mais barata |
| Previsão de fechamento | `core/mercado/previsao.ts` | Na MESMA fração da janela (abertura → fechamento), os k = 8 concursos fechados mais parecidos da modalidade (log de bolões e R$ inseridos, % vendido; +0,5 se outro dia da semana); sobra = à venda agora x mediana de (sobra final / à venda na fração); faixa de 80% = percentis 10 e 90. Mínimo para zerar = à venda / horas até fechar. Backtest dos últimos 16 só com concursos fechados antes de cada um (no simulado: erro mediano 2-4%, faixa acerta 56-89%) |
| Sugestões | `core/sugestoes/otimizador.ts` | Opção = formato (jogos x dezenas) + cotas; cota = custo dos jogos / cotas. Amostras = fração vendida de bolões ENCERRADOS iguais na UF (≥ 12), senão mesma faixa de preço e cotas entre metade e o dobro na UF, senão no Brasil. Lucro calculado por amostra (tarifa truncada + comissão − sobra) → esperado, chance de prejuízo (risco baixo ≤ 15% < médio ≤ 35% < alto), P10/P90. Franquia do dia: peso = procura da UF no mesmo dia da semana x lucro por R$; teto de 25% da procura por loteria; formato = maior lucro TOTAL dentro do valor alocado, preferindo risco baixo/médio (alto só se for o único, com aviso) |
| Simulador de posição | `core/abertura/simulador-posicao.ts` | Posição se o 1º bolão entrar x s depois de T0 = 1 + outras lotéricas do escopo cujo 1º bolão chegou antes (a 1ª fila é a ordem de chegada), refeito em cada abertura do mesmo dia da semana nas últimas 8 semanas: mediana, P10/P90, chance da pág. 1 e o último segundo com 50% e 80% de chance |
| Cronômetro | `proximaAbertura`, `ordenarFilaPreMontada`, `components/Cronometro.tsx` | T0 pelo horário padrão (21:45; domingo 11:45), alerta 2 min antes com som e notificação; fila pré-montada só no aparelho (localStorage), do mais valioso para o menos; placar = Ao vivo com a sua lotérica em destaque |
| Site público | `core/site/site.ts`, `apps/web/lib/site.ts`, migração 0006 | Config: tabela `sites` > `RADAR_SITES` (JSON) > padrão das lojas do dono (slug do nome); slugs não podem ser rotas do painel. Cota mostrada COM tarifa; chance = soma das chances dos jogos (tabelas oficiais). Carrinho manda o pedido pelo WhatsApp; "Comprar na CAIXA" = link público `#/bolao-caixa/{código}`. Métricas em `site_eventos` com id ANÔNIMO do navegador (sem IP nem dado pessoal). Na simulação, os jogos são de demonstração (marcados) |
| Artes | `apps/web/lib/artes.ts`, `lib/artes-dados.ts`, `/api/artes/{tipo}` | Resultado (último do banco; sem banco, a Mega 3.088 real), bolões disponíveis (do site), premiado e "Saiu aqui!" (maior prêmio da Conferência em 30 dias; sem prêmio, demonstração marcada em `x-dados`). Design próprio, marca = nome, WhatsApp, Instagram, endereço |
| Calendário | `core/calendario/sorteios.ts` | Dias de `MODALIDADES.diasSorteio` (páginas oficiais), 21h (domingo 11h), abertura 45 min depois; Loteca: aviso de apostas até sábado 14h; 31/12 = Mega da Virada às 20h. Referência: feriados mudam datas |
| Simulador de bolões | `core/simulador/bolao.ts` (`LIMITES_BOLAO`, `simularBolao`) | Limites oficiais do Bolão CAIXA por modalidade e nº de números (bolão e cota mínimos, cotas e jogos máximos, +Milionária até R$ 83.160, Loteca a partir de 3 duplos); cota mínima da linha = max(cota mínima, valor de 1 jogo / cotas máximas). Cota truncada no centavo, resíduo na última. Lotomania: página sem limites de bolão |
| Loteca | `core/loteca/marcacao.ts` | Odds sem margem (normaliza 1/odd); sem odds, Elo + mando (65) + forma, empate 28% x exp(−(dr/400)²). Melhor marcação = programação dinâmica exata maximizando a chance dos 14; as 38 combinações de duplos/triplos do volante (aposta R$ 2) |
| Ficha da lotérica | `core/mercado/estatisticas.ts` (`fichaLoterica`) | Terceiros: tudo conta como internet (o balcão não aparece); lucro só dos concursos encerrados; comparação = mediana das lotéricas da cidade e da UF |
| Resultado oficial | `core/conferencia/resultado.ts`, `apps/worker/src/fontes/resultados-caixa.ts` | API pública `servicebus2.caixa.gov.br/portaldeloterias/api/{modalidade}/{concurso}` (formato conferido em 21/11/2026 com JSON real de 9 modalidades; Super Sete deu erro 500 na CAIXA e tem fixture sintética). Guarda trevos, Time do Coração, Mês da Sorte e os 14 jogos da Loteca (migração 0005); o JSON bruto vai sem os bytes nulos que a CAIXA manda (`brutoParaGuardar`, o jsonb recusa). O coletor busca a cada 10 min os concursos sorteados sem resultado |
| Conferência | `core/conferencia/premios.ts` | Aposta múltipla = todas as apostas simples nela. "k de N": C(h, j) x C(n − h, k − j); +Milionária x C(g, i) x C(t − g, 2 − i) pelos trevos que a faixa aceita; Super Sete e Loteca pelo polinômio ∏(acertou ? x + m − 1 : m); Time do Coração e Mês da Sorte pagam cada aposta simples com o time/mês; Dupla Sena separa os sorteios pela repetição da faixa (as descrições são iguais). Jogo sem a marcação necessária vira aviso, nunca prêmio chutado. Seu prêmio = prêmio / cotas x cotas que sobraram |
| Probabilidade | `core/conferencia/probabilidade.ts` | Chance de cada faixa por jogo = hipergeométrica de acertar exatamente j (igual às tabelas oficiais de Mega, Quina, Lotofácil, Dupla Sena por sorteio, Lotomania, Timemania, Dia de Sorte, +Milionária e Super Sete); Loteca no critério da CAIXA (número esperado de apostas simples premiadas). Testes copiam as tabelas oficiais (`test/conferencia-oficial.test.ts`), inclusive a de quantidade de prêmios do Dia de Sorte (Mês de Sorte = 1 por aposta simples) e da Loteca |
| Estorno | `apps/web/lib/minha.ts` (`marcarEstorno`) | Só o usuário marca/desmarca (evento `estorno`); o coletor nunca desfaz |
| Contas e login | `core/contas/permissoes.ts`, `apps/web/lib/contas/*`, `middleware.ts`, migração 0007 | `RADAR_AUTH` (padrão: postgres com DATABASE_URL, senão desligado = painel aberto como antes). Link mágico (15 min, uso único, 5 por hora) ou senha (scrypt; só depois de confirmar o e-mail; 10 tentativas/15 min). Tokens e sessão: banco guarda só o SHA-256; cookie httpOnly SameSite=Lax; POST com Origin de outro site = 403. O middleware (runtime Node) valida a sessão, aplica a permissão da tela (`classificarRota`) e passa o contexto no cabeçalho interno `x-radar-contexto` (o do navegador é descartado); `contexto()` lê nas páginas e `minhasLotericas()` passa a ser as lojas da conta |
| Alertas | `core/notificacoes/alertas.ts`, `packages/avisos/gerar.ts`, migração 0008 | Monitorada entrou na abertura = 1º bolão em [T0, T0 + 30 min]; resumo semanal = segunda 08:00 SP (até 12 h depois), semana anterior; vendas agrupadas por loja e rodada (chave = maior id do evento); encerramento até 2 h depois; "vai zerar" = restantes / vendas da última hora <= horas até fechar, mantido 45 min (estado em memória no worker); resultado para todos; prêmio = conferência do bolão com o resultado novo. Central recebe tudo que a pessoa pode ver (tela da categoria + loja do colaborador); push só nos aparelhos cuja preferência aceita (`aparelhoAceita`); 404/410 desativa o aparelho |
| PWA e push | `apps/web/app/manifest.ts`, `public/sw.js`, `components/PushAparelho.tsx`, `/notificacoes`, `/monitoradas` | Service worker sem cache de dados (só página "sem conexão"); push com `tag` = chave; preferências POR APARELHO (cada inscrição); chaves VAPID só no ambiente. Sem worker (simulação), `sincronizarAlertasSimulados` gera os alertas na hora com as mesmas funções |
| Planos | `core/planos/planos.ts`, `lib/planos/*`, `/planos`, migração 0009 | Grátis ⊂ Pro ⊂ Pro+ ⊂ Gestão (telas e limites de lojas, pessoas e monitoradas; preços PROVISÓRIOS). Conta nova = teste de 14 dias com tudo (conta sem assinatura conta o teste da criação). Plano efetivo: cortesia > pago (pago_ate) > teste > atrasado com 5 dias de tolerância > Grátis. Assinar no teste = 1º vencimento no fim do teste. Telas fora do plano: `ctx.bloqueadas` → /planos?tela= (colaborador: /sem-permissao?motivo=plano; API 402). `RADAR_PLANOS=livre` desliga |
| Cobrança (Asaas) | `lib/planos/asaas.ts`, `/api/webhooks/asaas` | SÓ sandbox (`api-sandbox.asaas.com/v3`; chave `$aact_prod_` recusada); sem `ASAAS_API_KEY` = Asaas simulado. Cliente (CPF/CNPJ validado), assinatura MONTHLY PIX ou CREDIT_CARD (cartão digitado no Asaas), Pix QR. Webhook: token `asaas-access-token` = `ASAAS_WEBHOOK_TOKEN` (comparação em tempo constante), evento gravado uma vez (`webhooks_asaas.chave`), PAYMENT_CONFIRMED/RECEIVED = pago até vencimento + 1 mês, OVERDUE = atrasada, REFUNDED/CHARGEBACK = cai, SUBSCRIPTION_DELETED = cancelada (vale o já pago); responde 200 mesmo em evento ignorado |
| Equipe | `lib/contas/equipe.ts`, `/equipe` | Responsável (1 por conta, transferível) vê tudo; sócio tudo menos o plano e gerencia colaboradores; colaborador só as telas e lojas marcadas (nunca equipe/plano). Convite 7 dias, aceitar cria a pessoa (o token prova o e-mail) |
| Código da lotérica | `core/dominio/loterica.ts` | Forma canônica = campo `loterica` do JSON (`2894`); aceita `21.002894-7`, `210028947`, `002894`. `RADAR_MINHA_LOTERICA` = várias lojas (`código=Nome`, separadas por vírgula). Coli Loterias (São Paulo/SP) = 2894, franquia R$ 8.000; Legal Loterias (Vila Prudente) com código a informar |

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
| Job de fim de janela | `core/coleta/plano.ts` (tarefa `abertura`) + `apps/worker/src/coletor.ts` | Em T0 + 60 min grava `aberturas`/`abertura_participacoes` (substitui); no encerramento recalcula com a sobra |
| Consulta-base | `apps/worker/test/postgres.int.test.ts` | Agrupar por `l.id` além do nome: só por nome (como no exemplo da SPEC) junta lotéricas homônimas |
| Métricas semanais | `core/raio-x/semanal.ts` (`metricasSemanais`) | Escopo selecionável (default UF); medianas = `percentile_cont(0.5)` |
| Grade (tela 1) | `gradeSemanal` | 7 colunas seg..dom; com modalidade "todas" a célula mostra a MELHOR colocação do dia (empate: menor atraso); faixas pag1 / pag2-3 / pag4+ |
| Tendência | `tendencia` | Semana atual (pode ser parcial, sinalizado) × média das 4 anteriores |
| Chance de abrir | `chanceDeAbrir` | Só conta semanas em que houve abertura naquele dia da semana |
| Ranking (tela 4) | `core/raio-x/ranking.ts` | Critérios: mais aberturas, mais rápida (atraso mediano), mais pág. 1 |
| Comparar (tela 3) | `compararLotericas` | Até 6 lotéricas; "primeiro do dia" = menor atraso, empate pela colocação |
| Ao vivo (tela 5) | `ordemDeChegada` | Ordem por primeiro_em; filtro por UF/cidade |
| Elite e Top (`/elite`) | `core/raio-x/elite.ts` (`listasEliteTop`), `lib/mercado.ts` (`listasElite`) | Noite = aberturas do dia sem a Loteca, T0 = a mais cedo; abriu = bolão em [T0, T0 + 2 h]; também conta (com *) a noite com 90% da franquia usada antes do T0 (limite estimado = max(R$ 8.000, maior uso diário em 30 dias)); últimas 7 noites encerradas até as 06:00 ("refeitas toda manhã"); Elite = 7/7, Top ≥ 4/7; franquia média que resta e fila média por modalidade |

## Questões em aberto (decidir com o dono do produto)

Decididas em 21/11/2026: conta DEDICADA (`FONTE=caixa-navegador` + `CAIXA_CONTA_DEDICADA=true`) e, sem
conta, links públicos das lotéricas monitoradas (`FONTE=caixa-links`); break-even pela fórmula, em cotas e %;
5 s até T0 + 30 min; balcão gera tarifa; T0 por concurso com regras editáveis.

Ainda abertas:
1. **Estornado conta na franquia?** Padrão atual: NÃO conta (configurável). Confirmar com o Gabriel.
2. **Fila estática x dinâmica**: o `index` da CAIXA é guardado na entrada e a cada leitura; os dados vão responder.
3. Escopo da lista: a foto de SP confirmou cidade → resto do estado; falta ver se depois vem o resto do Brasil.
4. Preços e dias de sorteio em `core/dominio/modalidades.ts` conferidos nas páginas oficiais (21/11/2026);
   a Lotofácil não informa os dias na página (mantido seg a sáb). Horário de fechamento das cotas ainda é referência.
5. Formato dos jogos no detalhe do bolão do MKP para trevos, Time do Coração, Mês da Sorte, colunas do Super
   Sete e palpites da Loteca (o adaptador aceita os nomes prováveis; sem eles a faixa fica como aviso).
6. Super Sete: formato do resultado presumido (a API da CAIXA deu erro 500); trocar a fixture por um JSON real.
7. **Ordem dentro da fila** (chegada x aleatória): gravar uma abertura e rodar `pnpm analisar-abertura`; ajustar `VITRINE_ORDEM`.
8. Como verificar que a lotérica cadastrada é mesmo de quem cadastrou (hoje fica "não verificada").
9. Preços e limites dos planos (provisórios) e quando liberar o Asaas de produção.
