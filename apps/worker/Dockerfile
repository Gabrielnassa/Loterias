# Build a partir da raiz do monorepo: docker compose build worker
# Imagem oficial do Playwright na MESMA versão do pacote (1.63.0): traz o Chromium e as
# bibliotecas do sistema para FONTE=caixa-navegador. Para as outras fontes, node:22-slim basta.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
RUN corepack enable

# dependências primeiro (cache de camadas)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter "@radar/worker..."

COPY packages/core packages/core
COPY packages/db packages/db
COPY apps/worker apps/worker

ENV TZ=UTC NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
USER pwuser
CMD ["pnpm", "--filter", "@radar/worker", "start"]
