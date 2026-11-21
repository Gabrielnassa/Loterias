# Spec: sistema para lotéricas (inspirado no oLoterico, com melhorias)

## Resumo
O oLoterico (oloterico.com.br) é um SaaS em Laravel que lê o Marketplace de Bolões da CAIXA de minuto em minuto e transforma essa leitura em gestão, inteligência competitiva e marketing para lotéricas. Para superá-lo, o sistema precisa de: um coletor bem mais rápido no momento da abertura (de 5 em 5 segundos), histórico detalhado de qualquer lotérica (não só da própria) e o módulo novo Raio-X de Abertura, que mostra, para qualquer concorrente, quantas vezes abriu bolão na semana, em que dias, a que horas e em que colocação. Reproduza as funções, nunca a marca, os textos, as artes ou o código do oLoterico.

## Glossário do domínio
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
| Break-even | % de cotas que precisa vender para empatar | 8,6% |
| Código do bolão | jogos, dezenas, cotas | 6J-17D-40C = 6 jogos de 17 dezenas, 40 cotas |
| Estorno | Bolão cancelado; o usuário marca e desmarca manualmente | |
| TFL | Terminal Financeiro Lotérico | |

## Referência: o que o oLoterico faz
Stack observada: Laravel com Blade, Vite, Tailwind (tema escuro), Alpine.js 3.17, PWA instalável com Web Push, blocos pesados carregados sob demanda, artes geradas no servidor. Ritmo: contagem por modalidade a cada 1 min; cotas e lotéricas a cada ~15 min; front faz polling de 30 s a 5 min e mostra "sem leitura nova há X min" quando a fonte trava.

Planos: Grátis R$ 0 (calendário, simulador, mídias de resultado); Pro R$ 29,90; Pro+ R$ 49,90 (monitoramento, Lotérica MKP completa, notificações, site, estatísticas de todas as lotéricas, até 3 lojas); Gestão R$ 119,99 (fluxo de caixa, carro-forte, fechamento de caixa por TFL, fiados, DRE, despesas, lojas ilimitadas, permissões por pessoa; pausado para novas adesões). Aquisição só por convite (3 convites de 7 dias por lotérica).

## Mapa das telas (paridade)
| Tela | O que mostra | Regras e cálculos |
| --- | --- | --- |
| Início | KPIs (bolões à venda, cotas vendidas x/total, recebido, resultado), seus bolões por loteria, mercado agora, mídias prontas, site, próximos prêmios, equipe, sorteios de hoje, atalhos | Resultado = tarifa - encalhe; banner do próximo concurso especial; checklist do site (WhatsApp, logo, horário, sobre, Instagram) |
| Monitoramento MKP | Ao vivo por modalidade: bolões, cotas, lotéricas, R$ à venda, páginas, ticket médio, delta 5 min, ritmo/min, % esgotado, maiores bolões, filtro por UF, "Retrato" de uma data/hora | Previsão: pico previsto, sobram ~N no fechamento, mínimo para zerar ~X bolões/h, concursos parecidos, acerto histórico (ex.: 11 de 16), faixas de preço (ex.: cota R$ 50-100 sobra 1,9x mais que até R$ 10); abas minuto a minuto, páginas, hora a hora, R$ minuto a minuto |
| Filas MKP | Por loteria e região (Brasil, UF, cidades): bolões, esgotados, lotéricas, páginas, nº de filas, vendido, à venda, maior bolão, bolões novos por dia | Por fila: à venda, % vendido, formatos que vendem melhor, faixa de páginas, cota média, bolão médio, formato mais colocado; vendido por faixa de preço; ranking de maiores bolões |
| Estatísticas: Loterias | Panorama nacional: bolões, cotas, total inserido, ainda à venda, lotéricas | Agregados do último snapshot completo |
| Estatísticas: Lotéricas | Busca qualquer lotérica (nome, cidade, código); Top 10 | Ficha: franquia do dia, lucro do período (MKP + impressos + comissão), por loteria, evolução mensal, perfil dos bolões, velocidade de venda (tempo para esgotar, dia e hora que mais monta, heatmap), comparação com cidade e UF, maiores bolões, bolões à venda agora |
| Mega da Virada | Painel de filas dedicado ao concurso especial | Prêmio, contagem regressiva |
| Bolões MKP | Seus bolões ativos por loteria: hora de entrada, cotas vendidas/total, valor, recebido, custo, break-even, lucro, fila, página, posição cidade/UF/Brasil, estornados | Franquia de hoje; internet x balcão |
| Financeiro MKP | Resultado com comissão, recebido, custo, cotas vendidas, dia a dia, maiores lucros e prejuízos, detalhe por loteria e bolão | Prêmios não entram no resultado; resumo para imprimir |
| Conferência MKP | Prêmios dos seus bolões conferidos com resultado e rateio oficiais | Seu prêmio = prêmio total / cotas totais x cotas que sobraram; baixar planilha; arte do premiado |
| Sugestões | Divisão da franquia de amanhã entre loterias e formato recomendado | Pela procura na UF, prêmio, concorrência no mesmo dia e previsão; formato pelo que esgotou nas últimas 3 semanas na UF |
| Loteca | Probabilidade de cada jogo e melhor marcação por nº de duplos e triplos | Odds publicadas sem margem; sem odds, forma recente e mando; seleções por Elo |
| Posição na abertura | Sua posição na abertura em 7/30/90 dias, por dia da semana (você x outras lotéricas, % na pág. 1 da UF, pág. média), calendário "Abriu rápido?" com detalhe por dia | Só bolões da 1ª hora; entrou mais de 30 min depois não conta |
| Calendário, Comunicados CAIXA, Simulador | Sorteios do mês; circulares da CAIXA; custo, margem e cotas com ou sem franquia | Limites do Anexo I do Manual de Produtos CAIXA |
| Notificações | Central e preferências por aparelho | Vendas de hoje, todas, ou só no encerramento; resultados; previsão de zerar (só se mantida 45 min, até 6 h antes, 1 aviso por concurso); prêmios na sua lotérica |
| Mídias | Resultados com a marca ~1 h após o sorteio; artes dos bolões; gerador de arte com foto do bilhete (OCR); premiados; "Saiu aqui!"; vídeos; adesivos | Marca = logo, WhatsApp, Instagram, endereço |
| Site público /{slug} | Bolões em tempo real, filtros, jogos de cada bolão, chance do prêmio, carrinho, WhatsApp, link CAIXA, 3 temas | Métricas: visitas, pessoas, cliques WhatsApp, cliques CAIXA, carrinho |
| Conta | Cadastro, equipe e pedidos de acesso, caixas extras por TFL, aulas, convites, planos, assinatura | |

## Motor de dados
Tudo deriva de snapshots periódicos da vitrine pública do Marketplace. Venda, sobra, velocidade e colocação são diferenças entre snapshots, nunca dados oficiais; a frequência da coleta define a precisão.

Fase 0 (descobrir a fonte): identificar no portal/app Loterias CAIXA as chamadas que devolvem a lista de bolões (JSON ou HTML), parâmetros de paginação e filtros (modalidade, concurso, UF, cidade, lotérica), se a ordem devolvida é a da vitrine, e os campos (id do bolão, código e nome da lotérica, cidade, UF, modalidade, concurso, jogos e dezenas, cotas totais e disponíveis, valor da cota). Documentar em docs/fonte-caixa.md.

Dois modos de coleta:
| Modo | Quando | Frequência | O que lê |
| --- | --- | --- | --- |
| Normal | O dia inteiro | 60 s para contagens; varredura completa de cotas a cada 5-10 min por modalidade | Todas as modalidades e concursos abertos |
| Abertura | T0 - 1 min até T0 + 60 min (T0 = 21:45 seg-sáb, 11:45 dom; configurável por concurso) | 5 s nos primeiros 15 min, depois 15 s | Só o concurso recém-aberto |

Eventos derivados de cada par de snapshots: bolao_novo (id visto pela primeira vez; grava first_seen_at, posição observada e fila), venda (disponíveis diminuíram), esgotou (disponíveis = 0 ou sumiu antes do fechamento), encerrou (concurso fechou; sobra = disponíveis no último snapshot antes do fechamento), estorno (marcado pelo usuário).

Regras de cálculo:
- Fila = ordem do bolão entre os bolões da mesma lotérica no concurso, por first_seen_at.
- Posição no escopo (cidade, UF, Brasil) = ordenar os bolões visíveis do escopo por (fila, first_seen_at) e pegar o índice. Se a fonte já devolver a ordem da vitrine, usar o índice observado e guardar os dois.
- Página = teto(posição / 30).
- Colocação na abertura = posição no momento em que o bolão entrou (não a atual).
- Tarifa = 35% x valor base x cotas vendidas; comissão = 8,61% x apostas dos bolões com ao menos uma cota vendida; sobra = cotas sobradas x valor da aposta por cota; lucro = tarifa - sobras + comissão.
- Franquia usada = soma do valor sem tarifa dos bolões inseridos entre 05:00 e 23:00.

Previsão de fechamento: curva de disponíveis por minuto até o fechamento; "concursos parecidos" = N concursos passados da mesma modalidade mais próximos em dia da semana, prêmio, acumulado e nível atual (previsão pela mediana); mínimo para zerar = disponíveis / horas até o fechamento; mostrar acerto histórico (backtest) ao lado.

Outras fontes: resultados e rateio oficiais da CAIXA; lista de ganhadores por lotérica; calendário, comunicados e Manual de Produtos da CAIXA; odds de futebol (Loteca).

## Modelo de dados (PostgreSQL)
| Tabela | Campos principais | Observações |
| --- | --- | --- |
| lotericas | id, codigo_caixa (único), nome, slug, cidade, uf, bairro, lat/lng, first_seen_at | Todas as lotéricas vistas no MKP |
| contas, usuarios, conta_loterica | papel (responsável, sócio, colaborador), permissões por tela | Multi-loja e equipe |
| modalidades | slug, nome, cor, horário de sorteio, horário de fechamento | |
| concursos | modalidade, numero, data_sorteio, abre_em (T0), fecha_em, premio_estimado, acumulado, especial | abre_em é a base da abertura |
| boloes | id_caixa, loterica_id, concurso_id, jogos, dezenas, cotas_total, valor_cota, valor_aposta, first_seen_at, last_seen_at, fila, status, sobra_final, estornado | |
| bolao_jogos | bolao_id, numeros int[] | |
| snapshots_bolao (particionada por dia) | coletado_em, bolao_id, cotas_disponiveis, posicao_brasil, posicao_uf, posicao_cidade | Bruto; retenção fina 90 dias |
| eventos_bolao | bolao_id, tipo, em, quantidade | |
| coletas | modalidade, modo, iniciou_em, terminou_em, itens, erro | Saúde do coletor |
| mercado_minuto | modalidade, uf, minuto, boloes, cotas, lotericas, valor | |
| aberturas | concurso_id, t0, janela_min | |
| abertura_participacoes | abertura_id, loterica_id, primeiro_bolao_id, primeiro_em, atraso_s, n_boloes_1h, pos_cidade, pos_uf, pos_brasil, pagina_uf, valor_1h, sobra | Base do Raio-X |
| resultados, rateios, premios_bolao | | Conferência |
| ganhadores_loterica | loterica_id, concurso_id, faixa, valor, tipo | |
| franquia_diaria | loterica_id, dia, limite, usado | |
| monitoradas | conta_id, loterica_id, apelido | Watchlist |
| site_eventos | loterica_id, tipo, em, sessao | |
| notificacoes, push_assinaturas, preferencias_aviso, convites, planos, assinaturas, pagamentos | | |
Índices: boloes(concurso_id, first_seen_at), boloes(loterica_id, concurso_id), abertura_participacoes(loterica_id, abertura_id), snapshots_bolao(bolao_id, coletado_em), busca por texto em lotericas.

## Módulo novo: Raio-X de Abertura do Concorrente (prioridade)
Para qualquer lotérica, semana a semana: quantas aberturas pegou, em quais dias, a que horas entrou o 1º bolão e em que colocação ficou na cidade, no estado e no Brasil.

Definições:
- Abertura: janela de um concurso novo, de T0 (concursos.abre_em) até T0 + 60 min; uma noite pode ter várias (uma por modalidade); mostrar por modalidade e consolidado por dia.
- Participou: ao menos 1 bolão com first_seen_at entre T0 e T0 + 30 min (configurável).
- Horário de entrada: first_seen_at do 1º bolão; atraso = segundos desde T0.
- Colocação: posição desse 1º bolão no momento em que entrou, nos 3 escopos, com a página.
- Semana: segunda a domingo, fuso America/Sao_Paulo.

Métricas: aberturas na semana (participações / aberturas ocorridas); dias que abriu; hora do 1º bolão; atraso mediano; melhor colocação (mín. pos_uf); colocação mediana; % na página 1; volume na 1ª hora (n_boloes_1h, valor_1h); resultado (% vendido e sobra); tendência (semana atual x média das 4 anteriores); chance de abrir amanhã (frequência naquele dia da semana nas últimas 8 semanas).

Telas:
1. Aba "Aberturas" na ficha da lotérica: grade com uma linha por semana (últimas 12) e uma coluna por dia; célula = hora do 1º bolão + colocação no escopo + página, colorida por faixa (pág. 1, 2-3, 4+); vazia = não abriu; fim da linha: total, melhor, mediana; seletores de modalidade e escopo.
2. Detalhe da abertura: todos os bolões dela na janela, hora ao segundo, formato, cotas, valor, colocação nos 3 escopos, esgotou ou sobrou.
3. Comparar: você + até 5 concorrentes na mesma grade, "quem chegou primeiro" por dia.
4. Ranking da abertura por cidade/UF e período: quem abriu mais, quem chega mais rápido, quem mais fica na pág. 1. Exporta CSV e Excel.
5. Ao vivo na abertura: ordem de chegada da UF atualizada a cada 5 s, com a sua posição destacada.

Alertas: push em tempo real quando uma lotérica monitorada entra na abertura; resumo semanal toda segunda às 08:00 (push e e-mail).

Consulta-base:
```sql
select l.nome,
       date_trunc('week', a.t0 at time zone 'America/Sao_Paulo') as semana,
       count(*) as aberturas,
       array_agg(distinct extract(isodow from a.t0 at time zone 'America/Sao_Paulo')) as dias,
       min(p.pos_uf) as melhor_pos_uf,
       percentile_cont(0.5) within group (order by p.pos_uf) as pos_uf_mediana,
       percentile_cont(0.5) within group (order by p.atraso_s) as atraso_mediano_s,
       avg((p.pagina_uf = 1)::int) as pct_pagina1
from abertura_participacoes p
join aberturas a on a.id = p.abertura_id
join lotericas l on l.id = p.loterica_id
where p.loterica_id = any(:ids)
  and a.t0 >= now() - interval '12 weeks'
group by 1, 2
order by 2 desc;
```

API: GET /api/lotericas/{codigo}/aberturas?semanas=12&modalidade=todas&escopo=uf ; GET /api/aberturas/{id}/ranking?escopo=uf&uf=SP ; GET /api/aberturas/ao-vivo?uf=SP (SSE).

Precisão: com leitura a cada 5 s o erro máximo é 5 s; empates na mesma leitura usam a ordem da fonte e ficam marcados. O histórico só começa quando o coletor entrar no ar.

## Melhorias sobre o oLoterico (em ordem de prioridade)
1. Coleta na abertura a cada 5 s, com hora ao segundo e colocação de todas as lotéricas.
2. Raio-X de Abertura (acima).
3. Cronômetro de abertura: contagem regressiva, alerta às 21:43, fila de bolões pré-montados (o mais valioso primeiro, porque o 1º bolão define a 1ª fila) e placar ao vivo.
4. Simulador de posição: "se eu entrar às 21:45:30, em que página caio?", pela curva de chegada das últimas aberturas daquele dia da semana.
5. Otimizador da franquia: formato, valor da cota e nº de cotas maximizando lucro esperado = tarifa x chance de venda - sobra esperada, dentro do limite diário, com risco de cada opção.
6. Gestão da loja física: fechamento de caixa por TFL, fluxo de caixa, carro-forte, fiados, despesas e DRE, multi-loja.
7. Painel consolidado de todas as lojas do mesmo dono.
8. Mapa da concorrência por bairro e cidade.
9. Previsão com faixa de confiança e backtest visível.
10. Exportar CSV e Excel em todas as tabelas; API.
11. Site da lotérica com SEO local, domínio próprio opcional, QR code, pixel.
12. Agendamento e postagem direta de mídias (Instagram; WhatsApp com opt-in).
13. Página de status do coletor e buracos marcados nos gráficos.
14. Teste grátis de 14 dias e indicação com desconto.
15. Tema claro e escuro, modo resumo e modo analista, busca global (Ctrl+K).

## Stack e arquitetura
| Camada | Escolha | Por quê |
| --- | --- | --- |
| Monorepo | pnpm + Turborepo: apps/web, apps/worker, packages/db, packages/core | Regras de negócio em core, compartilhadas e testadas |
| Web | Next.js (App Router) + Tailwind + shadcn/ui + TanStack Table + ECharts | Telas densas, PWA, SSR para o site público |
| Banco | PostgreSQL 16 + Drizzle ORM | Particionamento nativo por dia |
| Coletor | Node em processo contínuo + BullMQ/Redis, relógio por NTP | Agendamento ao segundo |
| Hospedagem | VPS com Docker Compose (worker, Redis, Postgres); web na Vercel ou no VPS | Processo sempre ligado |
| Tempo real | Server-Sent Events | |
| Avisos | Web Push (VAPID) + e-mail; WhatsApp pela API oficial da Meta | |
| Artes e vídeos | Satori/resvg; Remotion | |
| Cobrança | Asaas (assinatura, Pix e cartão) | |
| Observabilidade | Sentry + logs estruturados + tabela coletas | |
Fluxo: fontes públicas (Marketplace, resultados, ganhadores, odds) -> coletores (agendador, modo normal, modo abertura) -> Postgres (snapshots -> eventos -> agregados) -> entrega (API/SSE, web/PWA, alertas, mídias). Eventos e agregados são recalculáveis a partir dos snapshots.

## Roadmap
- Fase 0: descoberta da fonte (HAR do portal ou acesso direto), docs/fonte-caixa.md e prova de conceito que baixa 3 páginas. Respeite limites, use backoff, não burle proteções.
- Fase 1: monorepo, Docker Compose (Postgres 16, Redis), schema com Drizzle (snapshots_bolao particionada), worker com os dois modos de coleta, geração de eventos, tabela coletas, testes de todas as regras em packages/core, CLAUDE.md.
- Fase 2: Raio-X de Abertura completo (tabelas, job ao fim de cada janela, métricas, API, telas 1 a 5, busca, watchlist, alertas), com teste de abertura simulada de 200 bolões.
- Fase 3: Bolões MKP, Financeiro, Conferência, Posição na abertura, exportação CSV/Excel, multi-loja.
- Fase 4: Monitoramento, Filas, Estatísticas, Mega da Virada, previsões com faixa e backtest, otimizador da franquia, simulador de posição.
- Fase 5: site público com SSR e SEO, gerador de artes e vídeos.
- Fase 6: autenticação, equipe com permissões, PWA com Web Push, planos via Asaas, teste grátis; depois gestão da loja física.

## Riscos e critérios de aceite
Riscos: fonte instável (adaptador isolado com testes de contrato; alerta após 3 falhas seguidas ou mudança de formato); uso responsável da fonte (só o necessário, limite de requisições, backoff, sem burlar bloqueio; validar termos de uso com advogado antes de vender); números de terceiros são estimativas e devem ter aviso; LGPD (não coletar dados de apostadores); escala da Mega da Virada (~100 mil bolões, ~3.300 páginas).

Critérios de aceite: coletor roda 7 dias com menos de 1% de leituras perdidas; 1º bolão de cada lotérica com erro máximo de 5 s em toda abertura; colocação bate com a vitrine real em 20 checagens manuais; grade semanal carrega em menos de 1 s com 12 semanas; alerta de concorrente chega em menos de 15 s; financeiro da Coli Loterias bate com o extrato real com tolerância de 1%; todas as tabelas exportam CSV e Excel.
