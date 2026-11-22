#!/usr/bin/env bash
# Prepara a sessão da conta DEDICADA da CAIXA usando um navegador no PRÓPRIO VPS, visto por VNC.
# Uma PESSOA responde a pergunta de idade/termos e faz o login (o robô nunca faz isso sozinho).
#
# 1. No VPS:            ./preparar-sessao-vnc.sh
# 2. No SEU computador: ssh -L 5900:127.0.0.1:5900 radar@IP-DO-VPS   (deixe aberto)
# 3. Abra um visualizador VNC (RealVNC Viewer, TigerVNC...) em localhost:5900 com a senha mostrada aqui.
# 4. No navegador que aparece: responda a idade, faça o login da conta DEDICADA, abra a área de bolões.
# 5. Volte a este terminal e tecle Enter: a sessão fica em ./sessao-caixa/estado.json e o worker é reiniciado.
#
# O VNC só escuta em 127.0.0.1 do VPS (não fica exposto na internet) e some quando o script termina.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p sessao-caixa
senha=$(openssl rand -hex 4)
echo "Senha do VNC desta vez: ${senha}"
docker compose --env-file .env run --rm --no-deps -p 127.0.0.1:5900:5900 --user root \
  -v "$(pwd)/sessao-caixa:/sessao-rw" -e SENHA_VNC="$senha" worker bash -c '
    set -e
    apt-get update -qq >/dev/null && apt-get install -y -qq x11vnc fluxbox >/dev/null
    Xvfb :99 -screen 0 1366x900x24 >/dev/null 2>&1 &
    export DISPLAY=:99
    sleep 1; fluxbox >/dev/null 2>&1 &
    x11vnc -display :99 -forever -shared -quiet -passwd "$SENHA_VNC" -rfbport 5900 >/dev/null 2>&1 &
    chown pwuser /sessao-rw
    su pwuser -c "cd /app && DISPLAY=:99 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright pnpm --filter @radar/worker caixa:preparar-sessao /sessao-rw/estado.json"
  '
chmod 600 sessao-caixa/estado.json
docker compose --env-file .env restart worker
echo "Sessão salva. Confira no .env: FONTE=caixa-navegador e CAIXA_CONTA_DEDICADA=true (depois: docker compose up -d worker)."
