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
| 0 — Descobrir a fonte | **Pendente**: rede do ambiente bloqueou a CAIXA. Contrato do adaptador, cliente HTTP educado, fixtures sintéticas e PoC de 3 páginas prontos |
| 1 — Monorepo, schema, worker, eventos, coletas | Pronta (testada com fonte simulada, Postgres 16 e Redis reais) |
| 2 — Raio-X de Abertura | Camada de regras pronta em `packages/core` (teste com abertura simulada de 200 bolões); falta job de fim de janela, API, telas, alertas |

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

Com Docker Compose (Postgres 16 + Redis + worker):

```bash
cp .env.example .env
docker compose up -d --build
```

Prova de conceito da fonte (3 páginas):

```bash
FONTE=fixture pnpm poc:fonte
```
