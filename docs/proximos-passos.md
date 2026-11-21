# Próximos passos (ponto de retomada)

Arquivo de passagem de bastão: se a sessão for interrompida (limite de uso), a próxima retoma daqui.

## Estado em 21/11/2026 (sessão 2)

Feito e com testes:
- Contrato bruto da CAIXA + `normalizarBolao` + fixtures (`packages/core/fonte/adaptadores/caixa-bruto.ts`, `fonte/fixtures/caixa/`).
- Fila observada (`index`) + calculada; migração `0002_fila_observada.sql`.
- Adaptador `caixa-navegador` (Playwright) em `apps/worker/src/fontes/caixa-navegador.ts`, portal falso em `apps/worker/test/portal-falso.ts`,
  sessão preparada por pessoa (`pnpm --filter @radar/worker caixa:preparar-sessao`). Teste ao vivo: para na pergunta de idade (correto).
- Job de fim de janela da abertura (grava `aberturas`/`abertura_participacoes`; recalcula no encerramento).
- Histórico simulado (800 lotéricas, 13 semanas) em `packages/core/simulacao/historico.ts`.
- `apps/web` (Next.js 15): telas 1 a 5, API, busca, CSV/Excel, SSE ao vivo. `next build` passa; testes em `apps/web/test/web.test.ts`.

Sessão 2 concluída (commit e push feitos). Itens que ficam para depois:

1. Decisão do dono do produto sobre a fonte real: conta DEDICADA da empresa, só links públicos das
   lotéricas monitoradas, ou não coletar a lista geral (ver `docs/fonte-caixa.md`).
2. Uma pessoa rodar `pnpm caixa:preparar-sessao` num computador com tela e testar
   `FONTE=caixa-navegador pnpm poc:fonte`; observar uma abertura real às 21:45 (ritmo, fila dinâmica, esgotados).
3. Estratégia de leitura na abertura com navegador (a meta de 5 s não cabe lendo todas as páginas).
4. Fonte Postgres para a web (ler `aberturas`/`abertura_participacoes`), watchlist e alertas (dependem de contas, Fase 6).
5. Testar as imagens Docker num ambiente com Docker (aqui não há daemon).

## Sessão 3 (21/11/2026, tarde) — respostas do Gabriel + etapas A a D

- [x] A. Respostas aplicadas: conta dedicada (sessão expirada para e avisa; volta sozinha quando a
      sessão é renovada) + modo `caixa-links`; break-even em cotas e % (`breakEvenGrupo`); 5 s até
      T0 + 30 min e leitura da borda da 1ª fila; balcão gera tarifa; estornado não conta na franquia
      (dúvida aberta); T0 por concurso (`regras_abertura`, `preverAbertura`, `ajustarT0`). Migração 0003.
- [x] B. Web lendo do Postgres (`lib/dados-postgres.ts`) + seed (`pnpm db:seed`); teste prova que dá o mesmo que a simulação.
- [x] C. `pnpm observar-abertura` (apps/worker/src/observador.ts): JSONL com cada página, cada leitura e um resumo.
- [x] D. Fase 3 (Minha lotérica) em `/minha`: Bolões MKP, Financeiro MKP, Conferência MKP (resultado oficial da
      CAIXA, migração 0004), Posição na abertura; CSV/Excel; estorno manual. Seed com jogos, balcão e resultados simulados.

Pendências conhecidas para depois: multi-loja e contas (Fase 6), watchlist e alertas, arte do premiado (Fase 5),
observar uma abertura real e calibrar a estratégia, testar as imagens Docker.

## Sessão 4 (21/11/2026, noite)

- [x] Código da lotérica em qualquer forma (`normalizarCodigoLoterica`) e várias lojas em
      `RADAR_MINHA_LOTERICA` (Coli Loterias = 2894, franquia R$ 8.000). Seletor de loja na `/minha`.
- [x] Conferência das 10 modalidades (`core/conferencia/premios.ts`), com resultado REAL da CAIXA de 9 delas em
      `packages/core/fonte/fixtures/resultados/` (Super Sete sintético: a API deu erro 500). Migração 0005 (marcações
      extras no jogo e no resultado). Corrigido: Dupla Sena real não diz o sorteio na faixa; JSON bruto com `\u0000`
      quebrava o jsonb ao gravar o resultado.
- Próximo sem depender do Gabriel: trocar a fixture do Super Sete por uma real quando a API voltar
  (`pnpm resultados -- --modalidade super-sete --concurso N`).

## Sessão 5 (21/11/2026, noite) — lote grande, nesta ordem

Retomar do primeiro item sem [x]. Commit e push a cada item.

- [x] 1. Conferência com as regras oficiais (páginas loterias.caixa.gov.br, 21/11/2026): teste de cada faixa de
      cada modalidade com o rateio real, tabelas oficiais de probabilidade (10 modalidades) e de quantidade de
      prêmios (Dia de Sorte, Loteca), regras do volante do Super Sete, limites de números; calendário oficial
      em `modalidades.ts` (Mega, Quina, Timemania e Dia de Sorte com domingo); `probabilidade.ts`.
- [x] 2. Fase 4 Mercado: `/mercado` (cartões ao vivo por modalidade, abas minuto a minuto, hora a hora, páginas e
      R$, filtro por UF, Retrato de data e hora), `/mercado/filas` (por fila, faixa de preço, maiores, novos por dia),
      `/estatisticas` (panorama), `/estatisticas/lotericas` (busca, Top 10, ficha completa), `/mega-da-virada`
      (contagem regressiva, filas, dia a dia). APIs com CSV/Excel. Simulação e Postgres (snapshots_bolao).
      Corrigido: gerador simulado travava com mais de ~330 lotéricas (nomes esgotados em São Paulo).
- [x] 3. Previsão de fechamento por concursos parecidos (`core/mercado/previsao.ts`): sobra de cotas, bolões e R$
      com faixa de 80%, pico, mínimo para zerar x ritmo atual, sobra por faixa de preço, os parecidos e o backtest
      dos últimos 16 ao lado (Monitoramento e `/api/mercado/previsao`). Testes com o histórico simulado.
- [x] 4. Sugestões (`/minha/sugestoes`, `core/sugestoes/otimizador.ts`): divisão da franquia de amanhã entre as
      loterias (procura da UF no mesmo dia da semana, concorrência, prêmio quando houver, lucro por R$) e otimizador
      de formato, cota e nº de cotas com lucro esperado, chance de prejuízo e P10/P90. No simulado quase tudo tem
      risco alto (vendem ~70%, perto do break-even de 67,7%): a tela avisa.
- [ ] 5. Simulador de posição + Cronômetro de abertura.
- [ ] 6. Fase 5: site público /{slug} (SSR, SEO, filtros, jogos, chance, WhatsApp, CAIXA, 3 temas, métricas) + artes (Satori).
- [ ] 7. Calendário de sorteios, Simulador de bolões (limites oficiais do bolão), Loteca (probabilidades e marcação).
- Quando o Gabriel mandar dados reais da vitrine (cidade de São Paulo), trocar as fixtures de `fonte/fixtures/caixa/`.
- Pendentes com o Gabriel: sessão da conta dedicada, observar uma abertura real, estorno na franquia,
  código da Legal Loterias.
