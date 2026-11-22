# Radar Lotérico

Sistema para lotéricas que lê a vitrine pública do Marketplace de Bolões da CAIXA e transforma as leituras
em gestão (bolões, financeiro, conferência de prêmios), inteligência competitiva (**Raio-X de Abertura**:
quem abre bolão, quando e em que colocação) e marketing (site da lotérica e artes).

- Especificação: [`SPEC.md`](SPEC.md) · regras, glossário e decisões: [`CLAUDE.md`](CLAUDE.md)
- Fonte de dados (o que a CAIXA expõe e como lemos): [`docs/fonte-caixa.md`](docs/fonte-caixa.md)
- Onde paramos e o que vem depois: [`docs/proximos-passos.md`](docs/proximos-passos.md)

## Demonstração navegável

**https://gabrielnassa.github.io/Loterias/**

As telas do sistema com **dados simulados** (lotéricas fictícias), calculadas no seu navegador: Raio-X
(grade semanal, detalhe da abertura, comparar, ranking, ao vivo), Monitoramento, Filas, Estatísticas, Mega da
Virada, Sugestões, simulador de posição, cronômetro, site público de exemplo, Calendário, Simulador de bolões
e Loteca. O que precisa do servidor (banco da sua lotérica, exportar CSV/Excel, gravar) mostra um aviso.

Como funciona: `apps/demo` reaproveita as páginas do `apps/web`; no build, `scripts/gerar-dados.ts` gera o
histórico simulado em JSON e as artes em PNG, e o Next exporta HTML/JS estáticos (`output: 'export'`,
`basePath: '/Loterias'`). O workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) publica a
cada push no branch padrão e todo dia de manhã (dados novos).

**Passo que só o dono do repositório pode fazer (uma vez):** no GitHub, **Settings › Pages › Build and
deployment › Source = "GitHub Actions"**. Depois, em **Actions › Demonstração (GitHub Pages) › Run workflow**
(ou com o próximo push), o site sai do README para a demonstração.

## Estado (22/11/2026)

| Fase | Situação |
| --- | --- |
| 0. Descobrir a fonte | API do portal mapeada; adaptador `caixa-navegador` (Playwright, navegador real, sem decifrar nada) e modo `caixa-links` (links públicos, sem login); decisão: conta DEDICADA. Foto real da vitrine de São Paulo analisada (escopos cidade → estado → Brasil). **Falta:** uma pessoa preparar a sessão da conta dedicada e gravar uma abertura real |
| 1. Monorepo, schema, coletor, eventos | **Pronta** (Postgres 16, Redis/BullMQ, modos normal e abertura a 5 s, T0 por concurso, snapshots particionados, `coletas`) |
| 2. Raio-X de Abertura | **Pronta**: telas 1 a 5, job de fim de janela, API, busca, listas Elite e Top. Falta: watchlist e alertas (dependem de contas, fase 6) |
| 3. Minha lotérica | **Pronta**: Bolões MKP (franquia, internet x balcão, break-even, colocação, estorno), Financeiro, Conferência das 10 modalidades com resultado e rateio oficiais, Posição na abertura, várias lojas, CSV/Excel. Precisa do banco com a coleta real |
| 4. Mercado e previsões | **Pronta**: Monitoramento MKP (ao vivo e "Retrato"), Filas, Estatísticas (panorama, Top 10, ficha de qualquer lotérica), Mega da Virada, previsão de fechamento com faixa e backtest, Sugestões (franquia de amanhã e otimizador de formato com risco), simulador de posição, cronômetro de abertura. A calibração fina depende de dados reais |
| 5. Site e artes | **Pronta**: site público `/{slug}` (SEO local, filtros, jogos, chance do prêmio, carrinho pelo WhatsApp, link da CAIXA, 3 temas, métricas anônimas) e 4 artes em PNG (resultado, bolões, premiado, "Saiu aqui!"). Falta: vídeos, foto do bilhete (OCR), agendar posts, domínio próprio, QR code |
| 6. Contas e gestão | **Não começada**: login, equipe e permissões, PWA com Web Push, planos (Asaas), gestão da loja física |
| Ferramentas | **Prontas**: Calendário de sorteios, Simulador de bolões (limites oficiais do bolão), Loteca (chances e melhor marcação) |

Números de terceiros (vendas, sobras, colocação) são **estimativas** a partir de leituras periódicas da vitrine;
as telas avisam. Enquanto o coletor real não tem histórico, a web mostra dados simulados (e avisa).

## Rodar local

Requisitos: Node 22 e pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm test
pnpm typecheck
```

Web em http://localhost:3000, sem banco (simulação em memória):

```bash
pnpm web:dev
```

Com Postgres e o seed de demonstração (lotéricas fictícias; a web avisa enquanto o seed existir):

```bash
DATABASE_URL=postgres://radar:radar@localhost:5432/radar pnpm db:seed
```

```bash
DATABASE_URL=postgres://radar:radar@localhost:5432/radar pnpm web:dev
```

Para apagar só o seed: `pnpm db:seed -- --limpar`. Testes com banco:
`DATABASE_URL_TESTE=postgres://postgres@localhost:5432/postgres pnpm test`.

Coletor sem Redis/Postgres (abertura simulada daqui a ~90 s, em memória):

```bash
FILA=memoria REPOSITORIO=memoria FONTE=simulada pnpm worker:dev
```

Tudo com Docker Compose (Postgres 16 + Redis + coletor + web):

```bash
cp .env.example .env
docker compose up -d --build
```

A demonstração estática, localmente (gera os dados e exporta em `apps/demo/out`):

```bash
DEMO_BASE_PATH= pnpm demo:build
```

## Coletar da CAIXA

Uma pessoa prepara a sessão do navegador com a conta DEDICADA (o robô nunca responde a pergunta de idade nem faz
login sozinho; a sessão não vai para o git):

```bash
pnpm caixa:preparar-sessao
```

```bash
FONTE=caixa-navegador CAIXA_CONTA_DEDICADA=true CAIXA_MODALIDADES=mega-sena pnpm poc:fonte
```

Para gravar uma abertura real (rode alguns minutos antes das 21:45, ou 11:45 no domingo):

```bash
FONTE=caixa-navegador CAIXA_CONTA_DEDICADA=true pnpm observar-abertura -- --modalidade mega-sena --t0 2026-11-22T11:45
```

O script espera até T0 − 1 min, lê o concurso novo a cada 5 s até T0 + 31 min e grava um `.jsonl` em
`apps/worker/observacoes/` (páginas, leituras, filas, resumo). Para no primeiro bloqueio, pedido de idade/login
ou sessão expirada. O arquivo não tem dados pessoais. Teste sem a CAIXA:
`FONTE=simulada pnpm observar-abertura -- --modalidade lotofacil --duracao-min 1`.

Resultado oficial de um concurso (o coletor também busca sozinho): `pnpm resultados -- --modalidade mega-sena --concurso 3088`
(atrás de proxy HTTP, com `NODE_USE_ENV_PROXY=1`).

## Configuração da lotérica

- `RADAR_MINHA_LOTERICA`: as lotéricas do dono, separadas por vírgula, cada uma `código` ou `código=Nome`, com o
  código em qualquer forma (`21.002894-7`, `210028947`, `002894` ou `2894`). Com mais de uma, as telas mostram um
  seletor de loja.
- `RADAR_FRANQUIA_LIMITE` (padrão 8000): teto diário da franquia.
- Site público: `RADAR_SITE_URL` (endereço base, para SEO) e `RADAR_SITES` (JSON com WhatsApp, Instagram, endereço,
  horário e tema de cada loja); com banco, a tela `/minha/site` grava na tabela `sites`.

Veja [`.env.example`](.env.example) para todas as variáveis.

## Estrutura

| Caminho | O que é |
| --- | --- |
| `packages/core` | Regras de negócio puras e testadas (fila, colocação, financeiro, franquia, eventos, plano de coleta, Raio-X, mercado, previsão, conferência, simulação) |
| `packages/db` | Migrações SQL (fonte da verdade), espelho Drizzle, seed |
| `apps/worker` | Coletor contínuo (agendador ao segundo, BullMQ, adaptadores da CAIXA, resultados) |
| `apps/web` | Painel e site público (Next.js 15), API, CSV/Excel, artes |
| `apps/demo` | Demonstração estática para o GitHub Pages (mesmas páginas, dados simulados no navegador) |
