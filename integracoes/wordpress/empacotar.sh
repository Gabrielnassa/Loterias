#!/usr/bin/env bash
# Gera radar-loterico.zip (o que se envia em Plugins › Adicionar novo › Enviar plugin).
set -euo pipefail
cd "$(dirname "$0")"
for f in radar-loterico/*.php radar-loterico/includes/*.php; do php -l "$f" >/dev/null; done
rm -f radar-loterico.zip
zip -qr -X radar-loterico.zip radar-loterico -x '*.DS_Store'
echo "radar-loterico.zip ($(du -h radar-loterico.zip | cut -f1)), versão $(grep -m1 'Version:' radar-loterico/radar-loterico.php | awk '{print $NF}')"
