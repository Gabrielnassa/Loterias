#!/usr/bin/env bash
# Restaura um backup: ./restaurar.sh backups/radar-AAAAMMDD-HHMM.dump
# Para web e worker, recria o banco a partir do arquivo e sobe de novo. Faça um backup antes!
set -euo pipefail
cd "$(dirname "$0")"
arquivo="${1:?informe o arquivo .dump}"
[ -f "$arquivo" ] || { echo "não achei $arquivo" >&2; exit 1; }
read -r -p "Isso SUBSTITUI os dados atuais pelos de ${arquivo}. Digite RESTAURAR para continuar: " ok
[ "$ok" = "RESTAURAR" ] || { echo "cancelado"; exit 1; }
docker compose --env-file .env stop web worker
# recria o banco vazio (o --clean do pg_restore não lida com as partições de snapshots_bolao)
docker compose --env-file .env exec -T postgres psql -U radar -d postgres -v ON_ERROR_STOP=1 \
  -c "drop database if exists radar with (force)" -c "create database radar owner radar"
docker compose --env-file .env exec -T postgres pg_restore -U radar -d radar --no-owner --exit-on-error < "$arquivo"
docker compose --env-file .env up -d
echo "restaurado de ${arquivo}"
