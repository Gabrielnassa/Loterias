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

Web (telas do Raio-X) em http://localhost:3000. Sem banco, usa a simulação em memória; com
`DATABASE_URL`, lê do Postgres. Para ter dados no banco antes do coletor real, grave o seed de
demonstração (lotéricas fictícias; a web mostra o aviso de dados simulados enquanto ele existir):

```bash
DATABASE_URL=postgres://radar:radar@localhost:5432/radar pnpm db:seed
```

```bash
DATABASE_URL=postgres://radar:radar@localhost:5432/radar pnpm web:dev
```

Para apagar só o seed: `pnpm db:seed -- --limpar`.

Com Docker Compose (Postgres 16 + Redis + worker + web):

```bash
cp .env.example .env
docker compose up -d --build
```

Prova de conceito da fonte (3 páginas):

```bash
FONTE=fixture pnpm poc:fonte
```

## Observar uma abertura real (para decidir a estratégia de leitura)

Rode alguns minutos antes da abertura (21:45, ou 11:45 no domingo), com a sessão do navegador já
preparada por uma pessoa (`pnpm caixa:preparar-sessao`, conta DEDICADA):

```bash
FONTE=caixa-navegador CAIXA_CONTA_DEDICADA=true pnpm observar-abertura -- --modalidade mega-sena --t0 2026-11-22T11:45
```

- Espera até T0 − 1 min e faz leituras completas do concurso novo a cada 5 s (`--intervalo-s`) até
  T0 + 31 min (`--duracao-min`). Se você não souber o número do concurso, ele detecta sozinho.
- Grava em `apps/worker/observacoes/abertura-<modalidade>-<data>-<hora>.jsonl` (ou `--saida`):
  uma linha por página lida (horário de início e fim, duração, itens, filas, bolões novos, hora do
  servidor), uma por leitura (duração, páginas, total de páginas, bolões, 1ª fila, atraso do slot e o
  que a estratégia faria) e um resumo no fim (quando a leitura completa passou de 5 s e com quantas
  páginas). As linhas são gravadas na hora: se cair no meio, o que já foi lido fica no arquivo.
- Para no primeiro bloqueio, pedido de idade/login ou sessão expirada (fica registrado).
- Me mande o arquivo `.jsonl` (ele não tem dados pessoais: só bolões e lotéricas da vitrine).
- Teste do script sem a CAIXA: `FONTE=simulada pnpm observar-abertura -- --modalidade lotofacil --duracao-min 1`.

## Minha lotérica (Fase 3)

`/minha` na web: Bolões MKP (franquia de hoje, internet x balcão, break-even em cotas e %, colocação,
estorno manual), Financeiro MKP (dia a dia, por loteria, maiores lucros e prejuízos), Conferência MKP
(prêmios com o resultado e o rateio oficiais; "seu prêmio" = prêmio / cotas x cotas que sobraram) e
Posição na abertura (7/30/90 dias, "abriu rápido?"). Tudo exporta CSV e Excel. Precisa do banco.

- `RADAR_MINHA_LOTERICA=<código>` escolhe a lotérica (com o seed, a demonstração usa 980011).
- `RADAR_FRANQUIA_LIMITE` (padrão 8000) é o teto diário da franquia.
- Resultado oficial: o coletor busca sozinho quando a fonte é real (`RESULTADOS_CAIXA=true` força).
  Manual: `pnpm resultados -- --modalidade mega-sena --concurso 3088`. Atrás de um proxy HTTP,
  rode com `NODE_USE_ENV_PROXY=1`.
