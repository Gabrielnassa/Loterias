# Radar Lotérico num VPS da Hostinger (Ubuntu + Docker)

O WordPress da hospedagem compartilhada **não roda** este sistema: ele precisa de Node.js (Next.js), PostgreSQL,
Redis e um coletor com navegador (Playwright) ligado o tempo todo. Por isso o sistema vai num **VPS**, e o
WordPress vira a porta de entrada, com o plugin em `integracoes/wordpress/radar-loterico`.

Este kit foi testado de verdade em 22/11/2026, num Ubuntu 24.04 limpo: build das imagens, Caddy com HTTPS,
migrações, seed, cadastro e login, API pública, backup e restauração.

## O que tem aqui

| Arquivo | Para quê |
| --- | --- |
| `docker-compose.yml` | Caddy (HTTPS automático) → web; worker (coletor + alertas); Postgres 16; Redis; `migrar` (roda as migrações e sai) |
| `Caddyfile` | Domínio, certificado Let's Encrypt, HTTP→HTTPS e cabeçalhos de segurança |
| `.env.exemplo` | Todas as configurações, comentadas. O `instalar.sh` copia para `.env` e gera as senhas |
| `instalar.sh` | Instala tudo num Ubuntu limpo (pode rodar de novo sem estragar nada) |
| `backup.sh` / `restaurar.sh` | Backup diário do Postgres (03:30, 14 dias) e restauração |
| `atualizar.sh` | Backup, baixa a versão nova do GitHub, reconstrói e sobe |
| `preparar-sessao-vnc.sh` | Navegador temporário no VPS, visto por VNC via túnel SSH, para uma pessoa preparar a sessão da CAIXA |

## Passo a passo

### 1. Contratar o VPS

Na Hostinger: **VPS › KVM 2** (2 vCPU, 8 GB de RAM; recomendado) ou **KVM 1** (4 GB; funciona, o instalador
cria 2 GB de swap). Sistema: **Ubuntu 24.04** (o modelo "Ubuntu 24.04 com Docker" também serve). Na criação,
cadastre a sua **chave SSH**: é mais seguro que senha.

Anote o **IP** do VPS (painel da Hostinger › VPS › Visão geral).

### 2. Apontar o subdomínio

No painel onde está o domínio `nassatech.com.br` (Hostinger › Domínios › DNS / Nameservers), crie:

| Tipo | Nome | Aponta para | TTL |
| --- | --- | --- | --- |
| A | `radar` | IP do VPS | 3600 |

Confira (no seu computador) depois de alguns minutos:

```bash
nslookup radar.nassatech.com.br
```

A resposta tem que trazer o IP do VPS. Sem isso, o HTTPS não sai (o Caddy tenta de novo sozinho depois).

### 3. Instalar

Entre no VPS como root e rode:

```bash
ssh root@IP-DO-VPS
```

```bash
curl -fsSL https://raw.githubusercontent.com/gabrielnassa/Loterias/claude/peaceful-noether-hs112s/deploy/hostinger-vps/instalar.sh -o instalar.sh
```

```bash
sudo bash instalar.sh --dominio radar.nassatech.com.br --email SEU-EMAIL --seed
```

`--seed` grava dados SIMULADOS para você conhecer as telas (o painel avisa "dados simulados"). Sem ele, o
banco começa vazio e enche conforme o coletor lê a vitrine.

O que aparece (saída real do teste, resumida; a 1ª construção leva de 5 a 15 minutos):

```text
==> 1/8 Atualizando o sistema e instalando o básico
    ok: pacotes instalados
    ok: Docker version 29.x
==> 2/8 Usuário radar
    ok: usuário criado
    ok: sua chave SSH também entra como radar
==> 3/8 Memória e swap
    ok: memória: 7940 MB
==> 4/8 Firewall (só SSH, 80 e 443) e proteção do SSH
    ok: Status: active
==> 5/8 Baixando o sistema em /opt/radar
    ok: clonado (57f6ba4)
    ok: .env pronto (senhas geradas; ele NÃO vai para o git)
==> 6/8 Construindo as imagens (pode levar 5 a 15 minutos na 1ª vez)
 Image radar-loterico-worker:local Built
 Image radar-loterico-web:local Built
    ok: chaves VAPID (Web Push) geradas
    ok: serviços no ar
NAME               IMAGE                         SERVICE    STATUS
radar-caddy-1      caddy:2.10-alpine             caddy      Up
radar-postgres-1   postgres:16-alpine            postgres   Up (healthy)
radar-redis-1      redis:7.4-alpine              redis      Up (healthy)
radar-web-1        radar-loterico-web:local      web        Up (health: starting)
radar-worker-1     radar-loterico-worker:local   worker     Up
==> 7/8 Dados SIMULADOS de demonstração (o painel avisa que são simulados)
seed gravado: 128666 bolões, 53079 participações
==> 8/8 Backup diário do Postgres (03:30, guarda 14 dias)
    ok: agendado em /etc/cron.d/radar-backup

Pronto! Abra https://radar.nassatech.com.br/cadastro para criar a conta do responsável.
```

Se aparecer `atenção: o DNS de radar.nassatech.com.br aponta para '...'`, volte ao passo 2. O resto do sistema
já está no ar e o certificado sai assim que o DNS apontar.

### 4. Criar a conta do responsável

Abra `https://radar.nassatech.com.br/cadastro`, informe nome, e-mail, a empresa e as lotéricas (uma por
linha, `código=Nome`, ex.: `2894=Coli Loterias`).

Enquanto o e-mail não está configurado (passo 5), o link de confirmação aparece no log:

```bash
cd /opt/radar/deploy/hostinger-vps && docker compose logs web | grep "api/auth/link"
```

Abra esse link no navegador: você entra no painel.

### 5. E-mail de verdade (links de acesso e convites)

Crie uma caixa de e-mail na Hostinger (ex.: `nao-responda@nassatech.com.br`) e ponha no `.env`:

```bash
nano /opt/radar/deploy/hostinger-vps/.env
```

```text
RADAR_EMAIL=smtp
SMTP_URL=smtps://nao-responda%40nassatech.com.br:SENHA@smtp.hostinger.com:465
EMAIL_REMETENTE=Radar Lotérico <nao-responda@nassatech.com.br>
```

(o `@` do usuário vira `%40` dentro da URL.) Depois:

```bash
cd /opt/radar/deploy/hostinger-vps && docker compose up -d web
```

### 6. Cobrança (Asaas sandbox)

1. Crie a conta em https://sandbox.asaas.com e gere a chave em **Integrações**.
2. No `.env`: `ASAAS_API_KEY=` com a chave (o `ASAAS_WEBHOOK_TOKEN` já foi gerado pelo instalador).
3. No sandbox: **Integrações › Webhooks › Adicionar**: URL `https://radar.nassatech.com.br/api/webhooks/asaas`,
   token = o `ASAAS_WEBHOOK_TOKEN` do `.env`, eventos de **Cobranças** e **Assinaturas**.
4. `docker compose up -d web`.

Para usar só nas suas lojas, sem cobrar ninguém, deixe `RADAR_PLANOS=livre` (já vem assim).

### 7. Notificações no celular

As chaves VAPID já foram geradas. No celular: abra o painel, toque em **Compartilhar › Adicionar à Tela de
Início** (no iPhone é obrigatório para receber push), abra pelo ícone, vá em **Notificações › Ligar
notificações neste aparelho** e toque em **Enviar um teste**.

### 8. Coleta real da vitrine (conta DEDICADA da CAIXA)

O coletor NUNCA faz login nem responde "Você tem mais de 18 anos?": uma pessoa prepara a sessão uma vez
(e de novo quando ela expirar: o coletor para e avisa). Duas formas:

**A. Pelo navegador do próprio VPS (VNC):**

```bash
cd /opt/radar/deploy/hostinger-vps && ./preparar-sessao-vnc.sh
```

No SEU computador, em outro terminal (deixe aberto):

```bash
ssh -L 5900:127.0.0.1:5900 radar@IP-DO-VPS
```

Abra um visualizador VNC (RealVNC Viewer, TigerVNC) em `localhost:5900` com a senha que o script mostrou.
No navegador que aparece: responda a idade, entre com a conta DEDICADA e abra a área de bolões. Volte ao
terminal do VPS e tecle Enter.

**B. Pelo seu computador (sessão exportada):** com o repositório e o Node instalados, rode
`pnpm caixa:preparar-sessao`, depois copie o arquivo:

```bash
scp .sessao-caixa/estado.json radar@IP-DO-VPS:/opt/radar/deploy/hostinger-vps/sessao-caixa/estado.json
```

Em qualquer caso, no `.env`: `FONTE=caixa-navegador` e `CAIXA_CONTA_DEDICADA=true`. Depois:

```bash
cd /opt/radar/deploy/hostinger-vps && docker compose up -d worker && docker compose logs -f worker
```

Sem conta, dá para acompanhar só lotéricas específicas pelos links públicos: `FONTE=caixa-links` e
`CAIXA_LOTERICAS=2894,...`.

### 9. WordPress como porta de entrada

1. No painel, em **Equipe › Integração com o seu site**, crie uma chave.
2. No WordPress: **Plugins › Adicionar novo › Enviar plugin** com `radar-loterico.zip` (pasta `integracoes/`).
3. **Configurações › Radar Lotérico**: URL `https://radar.nassatech.com.br` e a chave.
4. Para o site público da lotérica aparecer em iframe no WordPress, ponha no `.env`
   `RADAR_EMBED_ORIGENS=https://nassatech.com.br https://www.nassatech.com.br` e `docker compose up -d web`.

## Dia a dia

| Tarefa | Comando (em `/opt/radar/deploy/hostinger-vps`) |
| --- | --- |
| Ver se está tudo de pé | `docker compose ps` |
| Logs ao vivo | `docker compose logs -f web worker` |
| Atualizar para a versão nova | `./atualizar.sh` |
| Backup agora | `./backup.sh` (ficam em `backups/`; copie para fora do VPS de vez em quando) |
| Restaurar | `./restaurar.sh backups/radar-AAAAMMDD-HHMM.dump` |
| Reiniciar só o coletor | `docker compose restart worker` |
| Mudou o `.env` | `docker compose up -d` |

Backup fora do VPS (recomendado): instale e configure o `rclone` (ex.: Google Drive) e ponha
`BACKUP_RCLONE_DESTINO=gdrive:radar-backups` no `.env`. O `backup.sh` passa a copiar cada arquivo para lá.

## Segurança

- Só as portas 22, 80 e 443 ficam abertas (ufw); fail2ban protege o SSH.
- Banco e Redis não ficam expostos: só os containers falam com eles.
- `.env`, `sessao-caixa/` e `backups/` não vão para o git (e o `.env` fica com permissão 600).
- O painel não abre dentro de iframe de outro site; o site público da lotérica só nas origens de `RADAR_EMBED_ORIGENS`.
- Chaves do Asaas, SMTP e VAPID só no `.env` do VPS, nunca no repositório.

## Para quem for testar o build atrás de um proxy corporativo

Os Dockerfiles aceitam um certificado extra só na hora do build, sem mudar a imagem:

```bash
docker build -f apps/web/Dockerfile -t radar-loterico-web:local --secret id=ca,src=certificado.crt --build-arg HTTPS_PROXY=$HTTPS_PROXY .
```
