#!/usr/bin/env bash
# Empacota a demonstração estática (apps/demo/out) num .zip para qualquer hospedagem comum
# (public_html de um subdomínio na Hostinger, por exemplo). Rode DEPOIS do build, com o MESMO caminho:
#   DEMO_BASE_PATH= pnpm --filter @radar/demo pacote            # raiz de um subdomínio (demo.seudominio.com.br)
#   DEMO_BASE_PATH=/radar-demo pnpm --filter @radar/demo pacote  # numa subpasta (seudominio.com.br/radar-demo)
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${DEMO_BASE_PATH-/Loterias}"
[ -d out ] || { echo "rode o build antes (pnpm --filter @radar/demo build)" >&2; exit 1; }
grep -q "\"${BASE}/_next/" out/index.html 2>/dev/null || grep -q "${BASE}/_next/" out/index.html || { echo "o build em out/ não foi feito com DEMO_BASE_PATH='${BASE}'" >&2; exit 1; }

bash scripts/htaccess.sh "$BASE"

cat > out/LEIAME.txt <<TXT
RADAR LOTÉRICO: DEMONSTRAÇÃO ESTÁTICA (dados simulados, lotéricas fictícias)

Caminho deste pacote: "${BASE:-/}" (raiz do site se estiver vazio)

Como publicar na Hostinger (hospedagem comum, sem Node):
1. hPanel > Domínios > Subdomínios: crie, por exemplo, "demo" (demo.seudominio.com.br).
   Ele ganha uma pasta própria (ex.: public_html/demo ou domains/demo.seudominio.com.br/public_html).
2. hPanel > Gerenciador de Arquivos: abra essa pasta, envie o .zip e use "Extrair".
   Os arquivos (index.html, _next/, .htaccess...) devem ficar DIRETO na pasta do subdomínio.
   Se este pacote foi gerado para uma subpasta (ex.: /radar-demo), extraia dentro dessa subpasta.
3. Ative o SSL do subdomínio (hPanel > Segurança > SSL) e abra https://demo.seudominio.com.br/.

Tudo roda no navegador: não há banco, login nem coleta. O que a pessoa muda (equipe, monitoradas,
gestão) fica só no navegador dela. Para o sistema de verdade, veja deploy/hostinger-vps no repositório.
TXT

mkdir -p pacotes
if [ -n "$BASE" ]; then
  nome="radar-loterico-demo-$(echo "$BASE" | tr -c 'a-zA-Z0-9\n' '-' | sed 's/^-*//;s/-*$//').zip"
else
  nome="radar-loterico-demo.zip"
fi
rm -f "pacotes/$nome"
(cd out && zip -qr -X "../pacotes/$nome" . -x '*.DS_Store')
echo "pacotes/$nome ($(du -h "pacotes/$nome" | cut -f1), $(find out -type f | wc -l) arquivos, caminho '${BASE:-/}')"
