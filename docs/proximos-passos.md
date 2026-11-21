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

Pendente nesta sessão:
1. Conferir as telas no navegador (capturas) depois do universo de 800 lotéricas; corrigir o que aparecer.
2. Atualizar `docs/fonte-caixa.md` com os achados da Fase 0 (envelope, campos, `index` = fila, `tipoConsulta`
   0 cidade / 1 UF / 2 Brasil / 3 link da lotérica, rota exige login exceto `#/bolao-caixa/{código}`, pergunta de idade,
   cookies anti-robô `__uzm*`, `parametros-simulacao/datahora-servidor`), respondendo as perguntas da tabela.
3. Atualizar `CLAUDE.md` (fila observada, tarifa truncada, adaptador de navegador, web, consulta-base agrupando por `l.id`) e `README.md`.
4. Docker: Dockerfile do worker precisa do Chromium para `FONTE=caixa-navegador` (imagem do Playwright 1.63.0) e serviço `web` no compose.
5. Rodar `pnpm test` (com `DATABASE_URL_TESTE`) e `pnpm typecheck`, commit e push na branch `claude/peaceful-noether-hs112s`.
6. Responder ao usuário em português: pronto / falta / o que precisa dele.

Depois (fora desta sessão): fonte Postgres para a web (ler `aberturas`/`abertura_participacoes`), watchlist e alertas (dependem de contas, Fase 6).
