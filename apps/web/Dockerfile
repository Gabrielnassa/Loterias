# Build a partir da raiz do monorepo: docker compose build web
FROM node:22-slim
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1 TZ=UTC

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@radar/web..."

COPY packages/core packages/core
COPY packages/db packages/db
COPY apps/web apps/web
RUN pnpm --filter @radar/web build

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@radar/web", "start"]
