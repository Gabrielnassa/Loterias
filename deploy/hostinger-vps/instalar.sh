#!/usr/bin/env bash
# =====================================================================================================
# Radar Lotérico: instalação num VPS Ubuntu LIMPO (22.04 ou 24.04), por exemplo um VPS KVM da Hostinger.
#
#   curl -fsSL https://raw.githubusercontent.com/gabrielnassa/Loterias/claude/peaceful-noether-hs112s/deploy/hostinger-vps/instalar.sh -o instalar.sh
#   sudo bash instalar.sh --dominio radar.nassatech.com.br --email voce@exemplo.com [--seed] [--construir]
#
# (Sem SSH, pelo Docker Manager da Hostinger: use só o docker-compose.yaml; ver VARIAVEIS.md.)
# O que faz (pode rodar de novo sem estragar nada):
#   1. atualiza o sistema e instala Docker, git, firewall (ufw), fail2ban e atualizações automáticas;
#   2. cria o usuário "radar" (dono dos arquivos, sem senha; entra com a sua chave SSH);
#   3. cria 2 GB de swap se o VPS tiver pouca memória;
#   4. libera no firewall só SSH, 80 e 443;
#   5. baixa o sistema em /opt/radar, cria o .env com as senhas geradas;
#   6. baixa as imagens prontas (ghcr.io) ou, com --construir, constrói aqui; sobe tudo (Caddy com HTTPS,
#      web, worker, Postgres, Redis, backup); o "migrate" roda as migrações e gera as chaves VAPID;
#   7. (opcional, --seed) o "migrate" grava dados SIMULADOS de demonstração no banco;
#   8. backup diário do Postgres pelo serviço "backup" (03:30 de Brasília, guarda 14 dias).
# =====================================================================================================
set -euo pipefail

REPO="https://github.com/gabrielnassa/Loterias.git"
BRANCH="claude/peaceful-noether-hs112s"
DESTINO="/opt/radar"
USUARIO="radar"
DOMINIO=""
EMAIL=""
SEED=0
TESTE=0
CONSTRUIR=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dominio) DOMINIO="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --seed) SEED=1; shift ;;
    --construir) CONSTRUIR=1; shift ;;
    --repo) REPO="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --destino) DESTINO="$2"; shift 2 ;;
    # --teste: pula o upgrade do sistema, o firewall, o swap e os serviços (para testar o script)
    --teste) TESTE=1; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
done

passo() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m    ok:\033[0m %s\n' "$*"; }
aviso() { printf '\033[1;33m    atenção:\033[0m %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "rode com sudo (como root)" >&2; exit 1; }
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || aviso "testado em Ubuntu 22.04/24.04; este sistema é ${PRETTY_NAME:-desconhecido}"
[ -n "$DOMINIO" ] || read -r -p "Domínio do sistema (ex.: radar.nassatech.com.br): " DOMINIO
[ -n "$EMAIL" ] || read -r -p "Seu e-mail (avisos do certificado HTTPS): " EMAIL
export DEBIAN_FRONTEND=noninteractive

passo "1/8 Atualizando o sistema e instalando o básico"
apt-get update -qq
[ "$TESTE" -eq 1 ] || apt-get upgrade -y -qq
apt-get install -y -qq ca-certificates curl git gnupg openssl dnsutils ufw fail2ban unattended-upgrades cron >/dev/null
ok "pacotes instalados"

if ! command -v docker >/dev/null 2>&1; then
  passo "Instalando o Docker (repositório oficial)"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
[ "$TESTE" -eq 1 ] || systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null || { echo "Docker Compose não encontrado" >&2; exit 1; }
ok "$(docker --version)"

passo "2/8 Usuário ${USUARIO}"
if ! id "$USUARIO" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$USUARIO"
  ok "usuário criado"
fi
usermod -aG docker "$USUARIO"
if [ -f /root/.ssh/authorized_keys ] && [ ! -f "/home/${USUARIO}/.ssh/authorized_keys" ]; then
  install -d -m 700 -o "$USUARIO" -g "$USUARIO" "/home/${USUARIO}/.ssh"
  install -m 600 -o "$USUARIO" -g "$USUARIO" /root/.ssh/authorized_keys "/home/${USUARIO}/.ssh/authorized_keys"
  ok "sua chave SSH também entra como ${USUARIO}"
fi

if [ "$TESTE" -eq 0 ]; then
  passo "3/8 Memória e swap"
  mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
  if [ "$mem_mb" -lt 6000 ] && ! swapon --show | grep -q .; then
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "swap de 2 GB criado (memória: ${mem_mb} MB)"
  else
    ok "memória: ${mem_mb} MB"
  fi

  passo "4/8 Firewall (só SSH, 80 e 443) e proteção do SSH"
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
  systemctl enable --now fail2ban >/dev/null 2>&1 || true
  ok "$(ufw status | head -1)"
else
  passo "3-4/8 (teste: swap e firewall pulados)"
fi

passo "5/8 Baixando o sistema em ${DESTINO}"
if [ -d "${DESTINO}/.git" ]; then
  git -C "$DESTINO" fetch -q origin "$BRANCH" && git -C "$DESTINO" checkout -q "$BRANCH" && git -C "$DESTINO" pull -q --ff-only origin "$BRANCH"
  ok "atualizado ($(git -C "$DESTINO" log -1 --format=%h))"
else
  git clone -q --branch "$BRANCH" --depth 50 "$REPO" "$DESTINO"
  ok "clonado ($(git -C "$DESTINO" log -1 --format=%h))"
fi
chown -R "$USUARIO:$USUARIO" "$DESTINO"
cd "${DESTINO}/deploy/hostinger-vps"
install -d -o "$USUARIO" -g "$USUARIO" backups

# .env com segredos gerados (só preenche o que estiver vazio)
if [ ! -f .env ]; then cp .env.exemplo .env; fi
definir() { # definir CHAVE VALOR (só se estiver vazio no .env)
  local atual
  atual=$(grep -E "^$1=" .env | head -1 | cut -d= -f2- || true)
  if [ -z "$atual" ]; then
    if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
  fi
}
sed -i "s|^DOMINIO=.*|DOMINIO=${DOMINIO}|" .env
definir EMAIL_ACME "$EMAIL"
definir POSTGRES_PASSWORD "$(openssl rand -hex 24)"
definir ASAAS_WEBHOOK_TOKEN "$(openssl rand -hex 24)"
if [ "$SEED" -eq 1 ]; then sed -i "s|^SEED_DEMO=.*|SEED_DEMO=true|" .env; fi
if [ "$CONSTRUIR" -eq 1 ]; then
  if grep -qE '^COMPOSE_FILE=' .env; then sed -i "s|^COMPOSE_FILE=.*|COMPOSE_FILE=docker-compose.yaml:docker-compose.build.yml|" .env
  else echo "COMPOSE_FILE=docker-compose.yaml:docker-compose.build.yml" >> .env; fi
fi
chmod 600 .env
chown "$USUARIO:$USUARIO" .env
ok ".env pronto (senhas geradas; ele NÃO vai para o git)"

ip_publico=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)
ip_dns=$(dig +short A "$DOMINIO" | tail -1 || true)
if [ -n "$ip_publico" ] && [ "$ip_dns" != "$ip_publico" ]; then
  aviso "o DNS de ${DOMINIO} aponta para '${ip_dns:-nada}', mas este VPS é ${ip_publico}."
  aviso "o HTTPS só funciona depois que o registro A apontar para ${ip_publico} (o Caddy tenta de novo sozinho)."
fi

if grep -qE '^COMPOSE_FILE=.*build' .env; then
  passo "6/8 Construindo as imagens aqui (pode levar 5 a 15 minutos na 1ª vez)"
  docker compose --env-file .env build
else
  passo "6/8 Baixando as imagens prontas (ghcr.io)"
  docker compose --env-file .env pull --quiet
fi
docker compose --env-file .env up -d
ok "serviços no ar (o migrate já rodou as migrações e gerou as chaves VAPID)"
docker compose --env-file .env ps -a

if grep -qE '^SEED_DEMO=true' .env; then
  passo "7/8 Dados SIMULADOS de demonstração (o painel avisa que são simulados)"
else
  passo "7/8 Sem seed (use --seed para ver o painel com dados simulados)"
fi
docker compose --env-file .env logs --no-color --no-log-prefix migrate | grep -E "seed|fictícios|VAPID|migrações" || true

passo "8/8 Backup diário do Postgres (serviço backup: 03:30 de Brasília, guarda 14 dias)"
chmod +x backup.sh restaurar.sh atualizar.sh preparar-sessao-vnc.sh
rm -f /etc/cron.d/radar-backup
ok "no volume radar_backups; ./backup.sh faz um na hora em ./backups"

printf '\n\033[1;32mPronto!\033[0m Abra https://%s/cadastro para criar a conta do responsável.\n' "$DOMINIO"
echo "Logs: cd ${DESTINO}/deploy/hostinger-vps && docker compose logs -f web worker"
echo "Próximos passos (e-mail, Asaas, conta da CAIXA): ${DESTINO}/deploy/hostinger-vps/LEIAME.md"
