# syntax=docker/dockerfile:1.7
# Coletor (worker) do Radar Lotérico (também roda migrações e seed com o build local). Build da RAIZ do monorepo:
#   docker build -f apps/worker/Dockerfile -t radar-loterico-worker .
# Imagem oficial do Playwright na MESMA versão do pacote (1.63.0): traz o Chromium e as bibliotecas do
# sistema para FONTE=caixa-navegador. Atrás de proxy com certificado próprio: --secret id=ca,src=... .
FROM mcr.microsoft.com/playwright:v1.63.0-noble
ENV TZ=UTC PNPM_HOME=/pnpm PATH=/pnpm:$PATH PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm install -g pnpm@10.28.0 && pnpm --version
WORKDIR /app

# dependências primeiro (cache de camadas)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/avisos/package.json packages/avisos/
COPY apps/worker/package.json apps/worker/
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile --filter "@radar/worker..."

COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/avisos packages/avisos
COPY apps/worker apps/worker
RUN mkdir -p apps/worker/observacoes && chown -R pwuser:pwuser apps/worker/observacoes

ENV NODE_ENV=production
USER pwuser
# o coletor toca este arquivo a cada 30 s (VIVO_ARQUIVO); parado há mais de 2 min = doente
HEALTHCHECK --interval=60s --timeout=10s --start-period=120s --retries=3 \
    CMD find /tmp/radar-worker-vivo -mmin -2 | grep -q . || exit 1
CMD ["pnpm", "--filter", "@radar/worker", "start"]
