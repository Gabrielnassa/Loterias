#!/usr/bin/env bash
# Backup do Postgres (formato custom do pg_dump, comprimido) em ./backups, guardando 14 dias.
# O backup DIÁRIO é o serviço "backup" do compose (volume radar_backups). Este faz um na hora: ./backup.sh
# Cópia para fora do VPS (recomendado): defina BACKUP_RCLONE_DESTINO no .env (ex.: gdrive:radar-backups)
# depois de configurar o rclone (rclone config).
set -euo pipefail
umask 077
cd "$(dirname "$0")"
mkdir -p backups
arquivo="backups/radar-$(date -u +%Y%m%d-%H%M).dump"
docker compose --env-file .env exec -T postgres pg_dump -U radar -d radar -Fc > "${arquivo}.parcial"
mv "${arquivo}.parcial" "$arquivo"
echo "$(date -u +%FT%TZ) backup ${arquivo} ($(du -h "$arquivo" | cut -f1))"
find backups -name 'radar-*.dump' -mtime +14 -delete
destino=$(grep -E '^BACKUP_RCLONE_DESTINO=' .env 2>/dev/null | cut -d= -f2- || true)
if [ -n "$destino" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$arquivo" "$destino" && echo "copiado para ${destino}"
fi
