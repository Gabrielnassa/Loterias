# syntax=docker/dockerfile:1.7
# Imagem "migrate" do Radar Lotérico (ghcr.io/<dono>/radar-migrate): roda a cada subida e termina.
# Aplica as migrações, garante as chaves VAPID (geradas e guardadas no banco se o ambiente não trouxer) e
# cuida dos dados de demonstração (SEED_DEMO / FONTE; ver packages/db/iniciar.ts). Build da RAIZ do monorepo:
#   docker build -f packages/db/Dockerfile -t radar-migrate .
FROM node:22-slim
ENV TZ=UTC PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm install -g pnpm@10.28.0 && pnpm --version
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile --filter "@radar/db..."

COPY packages/core packages/core
COPY packages/db packages/db

ENV NODE_ENV=production
USER node
WORKDIR /app/packages/db
# sem o "pnpm run" na frente: os sinais chegam direto ao node e o log sai limpo
CMD ["node_modules/.bin/tsx", "iniciar.ts"]
