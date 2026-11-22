#!/usr/bin/env bash
# Atualiza o sistema para a última versão do GitHub: backup, baixa, reconstrói e sobe (migrações rodam sozinhas).
set -euo pipefail
cd "$(dirname "$0")"
./backup.sh
git -C ../.. pull --ff-only
docker compose --env-file .env build
docker compose --env-file .env up -d
docker image prune -f >/dev/null
docker compose --env-file .env ps
