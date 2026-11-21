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
- [ ] D. Fase 3 (Minha lotérica): Bolões MKP, Financeiro MKP, Conferência MKP, Posição na abertura, CSV/Excel.
