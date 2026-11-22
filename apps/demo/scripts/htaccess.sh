#!/usr/bin/env bash
# Escreve o .htaccess da demonstração estática para Apache/LiteSpeed (Hostinger e afins) em apps/demo/out:
#   - rotas limpas: /ranking/ serve ranking/index.html; /ranking (sem barra) vai para /ranking/ (o formato que o
#     Next gera com trailingSlash) mesmo se o servidor tiver o DirectorySlash desligado;
#   - 404 personalizado (404.html do próprio build);
#   - cache: _next/static (nome com hash) por 1 ano, imutável; ícones e imagens por 7 dias; HTML, dados e
#     service worker sempre revalidados (a versão nova aparece logo depois do deploy).
# Uso: bash apps/demo/scripts/htaccess.sh [caminho]   (caminho vazio = raiz do domínio; ex.: /radar-demo)
# Só diretivas que o LiteSpeed também entende (nada de <If>): o cache do _next/static vai num .htaccess próprio.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${1-}"
BASE="${BASE%/}"
[ -d out ] || { echo "rode o build antes (pnpm --filter @radar/demo build)" >&2; exit 1; }

cat > out/.htaccess <<HT
# Radar Lotérico: demonstração estática (dados simulados). Gerado por apps/demo/scripts/htaccess.sh.
Options -Indexes -MultiViews
DirectoryIndex index.html
ErrorDocument 404 ${BASE}/404.html

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase ${BASE:-}/
  # /rota sem barra no fim: se existir rota/index.html, redireciona para /rota/ (URL canônica do build)
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteCond %{REQUEST_FILENAME}/index.html -f
  RewriteRule ^(.*[^/])$ %{REQUEST_URI}/ [R=301,L]
  # /rota.html (link antigo ou digitado): vai para /rota/ quando ela existe
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} ^(.+)\.html$
  RewriteCond %1/index.html -f
  RewriteRule ^(.+)\.html$ \$1/ [R=301,L]
</IfModule>

<IfModule mod_mime.c>
  AddType application/manifest+json .webmanifest
  AddType application/javascript .js
  AddType application/json .json
  AddType image/svg+xml .svg
  AddType font/woff2 .woff2
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/css application/javascript application/json image/svg+xml application/manifest+json
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  # páginas, dados da demonstração e payloads do Next: sempre conferir se há versão nova
  <FilesMatch "\.(html|txt|json|webmanifest)$">
    Header set Cache-Control "public, max-age=0, must-revalidate"
  </FilesMatch>
  <FilesMatch "^sw\.js$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  <FilesMatch "\.(png|jpe?g|gif|webp|svg|ico|woff2?)$">
    Header set Cache-Control "public, max-age=604800"
  </FilesMatch>
</IfModule>
HT

# _next/static/ tem o hash no nome de cada arquivo: nunca muda, cache longo
mkdir -p out/_next/static
cat > out/_next/static/.htaccess <<'HT'
<IfModule mod_headers.c>
  Header set Cache-Control "public, max-age=31536000, immutable"
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresDefault "access plus 1 year"
</IfModule>
HT
echo "out/.htaccess e out/_next/static/.htaccess (caminho '${BASE:-/}')"
