# Build a partir da raiz do monorepo: docker compose build worker
FROM node:22-slim
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

ENV TZ=UTC NODE_ENV=production
USER node
CMD ["pnpm", "--filter", "@radar/worker", "start"]
