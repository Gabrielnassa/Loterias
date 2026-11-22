#!/usr/bin/env bash
# Atualiza para a versão nova: backup, baixa o repositório e as imagens (ou reconstrói, com COMPOSE_FILE do
# build no .env) e sobe. As migrações rodam sozinhas no serviço migrate.
set -euo pipefail
cd "$(dirname "$0")"
./backup.sh
git -C ../.. pull --ff-only
if grep -qE '^COMPOSE_FILE=.*build' .env; then docker compose --env-file .env build; else docker compose --env-file .env pull --quiet; fi
docker compose --env-file .env up -d
docker image prune -f >/dev/null
docker compose --env-file .env ps
