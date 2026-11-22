# Variáveis do `docker-compose.yaml`

O [`docker-compose.yaml`](docker-compose.yaml) é **autossuficiente**: só usa imagens prontas do GitHub Container
Registry (`ghcr.io/gabrielnassa/radar-web`, `radar-worker` e `radar-migrate`) e não precisa de nenhum arquivo ao lado.
Tudo se configura com as variáveis abaixo, que no **Docker Manager da Hostinger** vão no campo de variáveis de
ambiente (sem `.env`, sem terminal).

URL do compose para o Docker Manager (branch atual):

```text
https://raw.githubusercontent.com/gabrielnassa/Loterias/claude/peaceful-noether-hs112s/deploy/hostinger-vps/docker-compose.yaml
```

Legenda: **Obrig.** = sem ela o compose não sobe. **Segredo** = não mostre, não versione, não mande por chat
(só no campo de variáveis do servidor).

## Mínimo para subir

| Variável | Obrig. | Segredo | Exemplo | Para quê |
| --- | --- | --- | --- | --- |
| `DOMINIO` | sim | não | `radar.nassatech.com.br` | Endereço do sistema. O Caddy pede o certificado HTTPS para este nome: o registro **A** do DNS tem que apontar para o IP do VPS antes |
| `POSTGRES_PASSWORD` | sim | **sim** | `Xk29fQm81LpZ...` (32+ letras e números) | Senha do banco (só entre os containers). **Só letras e números** (ela entra numa URL). Gere uma aleatória e não troque depois: o banco já criado continua com a senha antiga |
| `EMAIL_ACME` | não | não | `voce@nassatech.com.br` | E-mail para avisos do Let's Encrypt (certificado vencendo). Vazio = certificado sem e-mail |

Com só essas, o sistema sobe em **modo simulado** (abaixo), com login, painel, site público, artes e alertas.

## Modo de fonte (comece em `simulada`)

| Variável | Obrig. | Segredo | Padrão | Para quê |
| --- | --- | --- | --- | --- |
| `FONTE` | não | não | `simulada` | De onde o coletor lê: `simulada` (sem CAIXA; abertura de teste a cada partida), `caixa-navegador` (vitrine real com a sessão da conta dedicada), `caixa-links` (sem conta: só os links públicos de `CAIXA_LOTERICAS`) ou `fixture` |
| `SEED_DEMO` | não | não | `true` | `true` = o `migrate` grava UMA vez o histórico SIMULADO de 13 semanas (800 lotéricas fictícias), para as telas terem o que mostrar; `false` = não grava; `limpar` = apaga |

**Comece com `FONTE=simulada` e deixe assim até existir a sessão da conta DEDICADA da CAIXA.** Enquanto a fonte
for de teste (`simulada` ou `fixture`) ou houver dado fictício no banco, o painel mostra no topo a faixa
**"Dados simulados"**: nada ali é da vitrine real.

Para passar para a vitrine real:

1. Uma **pessoa** prepara a sessão da conta **dedicada** da empresa (nunca a conta pessoal de alguém): no
   computador dela, com o repositório e o Node, `pnpm caixa:preparar-sessao`; ela mesma responde a pergunta de
   idade e faz o login (o robô nunca faz isso). No fim, o comando mostra como gerar o **base64** do arquivo.
2. No Docker Manager: `FONTE=caixa-navegador`, `CAIXA_CONTA_DEDICADA=true` e `CAIXA_SESSAO_JSON=` o base64.
   Reimplante.
3. Com `FONTE=caixa-*`, o `migrate` **apaga sozinho** os dados fictícios (seed e abertura simulada; nada que
   veio da CAIXA é tocado) e a faixa "Dados simulados" some. O histórico real começa nesse momento.
4. Se a sessão expirar (ou a CAIXA não aceitar a sessão vinda de outro IP), o coletor **para e avisa** no log do
   `worker`. Prepare de novo e troque o `CAIXA_SESSAO_JSON`. Com terminal no VPS também dá para preparar lá
   mesmo, por VNC (`preparar-sessao-vnc.sh`, [LEIAME](LEIAME.md) passo 8).

## Coletor (worker)

| Variável | Obrig. | Segredo | Padrão | Para quê |
| --- | --- | --- | --- | --- |
| `CAIXA_SESSAO_JSON` | com `caixa-navegador` | **sim** | vazio | Sessão do navegador (storageState do Playwright) em base64. Contém cookies da conta: trate como senha |
| `CAIXA_CONTA_DEDICADA` | não | não | `false` | `true` quando a sessão é de uma conta DEDICADA logada (voltar para a home = sessão expirada) |
| `CAIXA_MODALIDADES` | não | não | `mega-sena,lotofacil,quina` | Modalidades acompanhadas na vitrine |
| `CAIXA_ESCOPOS` | não | não | `cidade` | Até onde ler a lista: `cidade`, `estado` ou `brasil` |
| `CAIXA_INTERVALO_MS` | não | não | `3000` | Pausa mínima entre páginas (ritmo baixo e educado; não diminua sem motivo) |
| `CAIXA_LOTERICAS` | com `caixa-links` | não | vazio | Códigos das lotéricas monitoradas pelos links públicos, separados por vírgula (ex.: `2894,1234`) |
| `VITRINE_ORDEM` | não | não | `fila-chegada` | Ordem dentro da fila na colocação calculada (`fila-chegada` ou `fila-aleatoria`; decidir com `pnpm analisar-abertura`) |
| `RESULTADOS_CAIXA` | não | não | `true` | Busca o resultado oficial de cada concurso na API pública da CAIXA (Conferência) |
| `ALERTAS` | não | não | `true` | Alertas da central e Web Push (monitoradas, vendas, resultados, prêmios, resumo semanal) |
| `NTP_SERVIDOR` | não | não | `a.ntp.br` | Relógio de referência (precisão do horário de entrada) |
| `LOG_LEVEL` | não | não | `info` | `debug`, `info`, `warn` ou `error` |

## Painel e site (web)

| Variável | Obrig. | Segredo | Padrão | Para quê |
| --- | --- | --- | --- | --- |
| `RADAR_AUTH` | não | não | `postgres` | Login e contas no banco. `desligado` abre o painel sem login (só para teste!) |
| `RADAR_PLANOS` | não | não | `livre` | `livre` = sem bloqueio de telas por plano (uso nas suas lojas). Vazio = planos e teste de 14 dias valendo |
| `RADAR_FRANQUIA_LIMITE` | não | não | `8000` | Teto diário padrão da franquia em R$ (cada loja pode ter o seu) |
| `RADAR_EMAIL` | não | não | `console` | `console` = o link de acesso sai só no log do `web` (dá para criar a 1ª conta assim); `smtp` = envia de verdade |
| `SMTP_URL` | com `smtp` | **sim** | vazio | Ex.: `smtps://nao-responda%40nassatech.com.br:SENHA@smtp.hostinger.com:465` (o `@` do usuário vira `%40`) |
| `EMAIL_REMETENTE` | não | não | vazio | Ex.: `Radar Lotérico <nao-responda@nassatech.com.br>` |
| `RADAR_EMBED_ORIGENS` | não | não | vazio | Sites que podem mostrar o site público da lotérica em iframe (WordPress), separados por espaço: `https://nassatech.com.br https://www.nassatech.com.br` |

## Cobrança (Asaas, só sandbox nesta versão)

| Variável | Obrig. | Segredo | Padrão | Para quê |
| --- | --- | --- | --- | --- |
| `ASAAS_API_KEY` | não | **sim** | vazio | Chave do **sandbox** (`$aact_hmlg_...`; a de produção é recusada). Vazio = cobrança simulada |
| `ASAAS_WEBHOOK_TOKEN` | com Asaas | **sim** | vazio | Texto aleatório (32+ letras e números) que você também cadastra no webhook do sandbox: `https://DOMINIO/api/webhooks/asaas` |

## Notificações (Web Push)

| Variável | Obrig. | Segredo | Padrão | Para quê |
| --- | --- | --- | --- | --- |
| `VAPID_PUBLIC_KEY` | não | não | vazio | Vazias = o `migrate` gera um par na 1ª subida e guarda no banco (tabela `config_sistema`). Só defina se já tiver um par (`pnpm --filter @radar/avisos vapid`) |
| `VAPID_PRIVATE_KEY` | não | **sim** | vazio | Par da de cima. Trocar o par depois invalida os aparelhos inscritos |
| `VAPID_ASSUNTO` | não | não | `https://DOMINIO` | Contato do servidor para os serviços de push (`mailto:...` ou `https://...`) |

## Backup

| Variável | Obrig. | Segredo | Padrão | Para quê |
| --- | --- | --- | --- | --- |
| `BACKUP_HORA_UTC` | não | não | `06:30` | Hora do `pg_dump` diário, em UTC (06:30 UTC = 03:30 em Brasília). O 1º sai 1 min depois de subir |
| `BACKUP_DIAS` | não | não | `14` | Quantos dias de backup guardar no volume `backups` |

Os backups ficam no volume `radar_backups` (`/var/lib/docker/volumes/radar_backups/_data` no VPS), no formato do
`pg_dump -Fc` (restaura com `pg_restore`; ver `restaurar.sh`). Ative também o backup/snapshot semanal do VPS no
hPanel: o volume está no mesmo disco.

## Imagens (raramente mudam)

| Variável | Obrig. | Segredo | Padrão | Para quê |
| --- | --- | --- | --- | --- |
| `RADAR_VERSAO` | não | não | `latest` | Tag das 3 imagens: `latest` (a última do branch) ou o SHA de um commit, para fixar/voltar uma versão |
| `RADAR_IMAGENS` | não | não | `ghcr.io/gabrielnassa` | Registro e dono das imagens (num fork: `ghcr.io/outro-dono`, em minúsculas) |
| `RADAR_PULL` | não | não | `always` | `always` = baixa a imagem a cada implantação (pega a `latest` nova); `missing` = só se não tiver |
| `COMPOSE_FILE` | não | não | vazio | Só no kit com SSH: `docker-compose.yaml:docker-compose.build.yml` constrói as imagens na própria VPS (`instalar.sh --construir`) |

## O que sobe

| Serviço | Imagem | Volume | Saúde |
| --- | --- | --- | --- |
| `postgres` | `postgres:16-alpine` | `pgdata` | `pg_isready` |
| `redis` | `redis:7.4-alpine` | `redisdata` | `redis-cli ping` |
| `migrate` | `radar-migrate` | — | roda e sai com código 0 (web e worker esperam por ele) |
| `worker` | `radar-worker` (Playwright + Chromium) | `sessao_caixa`, `observacoes` | arquivo tocado a cada 30 s |
| `web` | `radar-web` | — | `GET /manifest.webmanifest` |
| `caddy` | `caddy:2.10-alpine` (portas 80 e 443) | `caddy_data`, `caddy_config` | API local do Caddy |
| `backup` | `postgres:16-alpine` | `backups` | há um backup das últimas 26 h |

Todos com `restart: unless-stopped` (menos o `migrate`, que roda a cada implantação) e logs limitados a 30 MB por
serviço.

## Primeira conta

Abra `https://DOMINIO/cadastro`. Com `RADAR_EMAIL=console`, o link de confirmação aparece no log do serviço `web`
(procure por `api/auth/link`); com SMTP, chega por e-mail.
