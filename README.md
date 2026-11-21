# Radar Lotérico

Coletor e inteligência do Marketplace de Bolões da CAIXA para lotéricas: leitura da vitrine a cada
5 s na abertura, histórico de qualquer lotérica e o **Raio-X de Abertura** (quantas vezes cada
concorrente abriu bolão na semana, em que dias, a que horas e em que colocação).

- Especificação: [`SPEC.md`](SPEC.md)
- Regras, glossário e decisões: [`CLAUDE.md`](CLAUDE.md)
- Fonte de dados (Fase 0, pendente): [`docs/fonte-caixa.md`](docs/fonte-caixa.md)

## Estado

| Fase | Situação |
| --- | --- |
| 0 — Descobrir a fonte | API mapeada (docs/fonte-caixa.md); adaptador `caixa-navegador` (Playwright) pronto. Falta decidir como obter a lista geral (exige login) |
| 1 — Monorepo, schema, worker, eventos, coletas | Pronta (testada com fonte simulada, Postgres 16 e Redis reais) |
| 2 — Raio-X de Abertura | Regras, job de fim de janela, API, busca e telas 1 a 5 (`apps/web`, com dados simulados). Falta watchlist e alertas (dependem de contas) e a web ler do Postgres |

## Rodar

```bash
pnpm install
pnpm test
pnpm typecheck
```

Worker sem Redis/Postgres (abertura simulada daqui a ~90 s, em memória):

```bash
FILA=memoria REPOSITORIO=memoria FONTE=simulada pnpm worker:dev
```

Web (telas do Raio-X com dados simulados) em http://localhost:3000:

```bash
pnpm web:dev
```

Com Docker Compose (Postgres 16 + Redis + worker + web):

```bash
cp .env.example .env
docker compose up -d --build
```

Prova de conceito da fonte (3 páginas):

```bash
FONTE=fixture pnpm poc:fonte
```
