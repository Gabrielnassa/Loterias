# syntax=docker/dockerfile:1.7
# Web (Next.js) do Radar Lotérico. Build a partir da RAIZ do monorepo:
#   docker build -f apps/web/Dockerfile -t radar-loterico-web .
# Atrás de proxy com certificado próprio (redes corporativas): --secret id=ca,src=certificado.crt e
# --build-arg HTTPS_PROXY=...; sem isso, nada muda.
FROM node:22-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 TZ=UTC PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm install -g pnpm@10.28.0 && pnpm --version
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/avisos/package.json packages/avisos/
COPY apps/web/package.json apps/web/
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile --filter "@radar/web..."
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/avisos packages/avisos
COPY apps/web apps/web
RUN pnpm --filter @radar/web build && chown -R node:node apps/web/.next

ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/manifest.webmanifest').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@radar/web", "start"]
