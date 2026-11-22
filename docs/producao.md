# Colocar o Radar Lotérico no ar: checklist

O WordPress da hospedagem compartilhada **não roda** o sistema (ele precisa de Node.js, PostgreSQL, Redis e um
coletor com navegador ligado 24 h). O desenho é:

- **VPS da Hostinger** com o sistema completo em `https://radar.nassatech.com.br` (kit em `deploy/hostinger-vps`);
- **WordPress** (o site que já existe) como porta de entrada, com o plugin `integracoes/wordpress/radar-loterico.zip`;
- **Demonstração estática** (opcional) num subdomínio comum, com o zip da release "pacotes".

Siga na ordem. O que é clique ou contrato está marcado com ☐.

## 1. Contratar e preparar (uma vez)

1. ☐ **VPS**: hPanel › VPS › contratar **KVM 2** (8 GB; recomendado) ou **KVM 1** (4 GB; funciona com o swap
   que o instalador cria). Sistema: **Ubuntu 24.04**. Cadastre sua **chave SSH** na criação. Anote o **IP**.
2. ☐ **DNS do subdomínio**: hPanel › Domínios › `nassatech.com.br` › DNS: registro **A**, nome `radar`, valor =
   IP do VPS. Espere propagar (`nslookup radar.nassatech.com.br` devolve o IP).
3. ☐ **E-mail de envio**: hPanel › E-mails: crie `nao-responda@nassatech.com.br` (para os links de acesso e os
   convites). Anote a senha.
4. ☑ **GitHub Pages** (demonstração pública): já ativado; o workflow publica sozinho em
   https://gabrielnassa.github.io/Loterias/ a cada mudança e todo dia de manhã.

## 2. Instalar o sistema no VPS

5. ☐ No seu computador: `ssh root@IP-DO-VPS` e rode os 2 comandos do passo 3 de
   [`deploy/hostinger-vps/LEIAME.md`](../deploy/hostinger-vps/LEIAME.md) (o `instalar.sh` com
   `--dominio radar.nassatech.com.br --email SEU-EMAIL`). Leva de 10 a 20 minutos. No fim aparece
   `Pronto! Abra https://radar.nassatech.com.br/cadastro`.
6. ☐ Abra `https://radar.nassatech.com.br/cadastro` e crie a conta do **responsável** com as lotéricas
   (`2894=Coli Loterias`). Pegue o link de confirmação no log (passo 4 do LEIAME) e entre.
7. ☐ No `.env` do VPS (`nano /opt/radar/deploy/hostinger-vps/.env`): `RADAR_EMAIL=smtp`, `SMTP_URL` e
   `EMAIL_REMETENTE` (passo 5 do LEIAME). `docker compose up -d web`.

## 3. Chaves e serviços

8. ☐ **VAPID (notificações)**: já geradas pelo instalador. Só teste: no celular, abra o painel, "Adicionar à
   Tela de Início", entre pelo ícone, **Notificações › Ligar** e **Enviar um teste**.
9. ☐ **Asaas (cobrança, sandbox)**: crie a conta em https://sandbox.asaas.com, gere a chave em Integrações e
   ponha `ASAAS_API_KEY` no `.env`. No sandbox, cadastre o webhook
   `https://radar.nassatech.com.br/api/webhooks/asaas` com o token `ASAAS_WEBHOOK_TOKEN` do `.env`.
   `docker compose up -d web`. Enquanto usar só nas suas lojas, deixe `RADAR_PLANOS=livre`.
10. ☐ **Decidir**: preços dos planos (hoje provisórios) e quando liberar o Asaas de produção (exige mudança no
    código: hoje só o sandbox é aceito).

## 4. Coleta real da vitrine da CAIXA

11. ☐ **Conta DEDICADA da CAIXA** (da empresa; nunca a conta pessoal de alguém) no portal Loterias Online.
12. ☐ **Preparar a sessão** (uma pessoa responde a idade e faz o login; o robô nunca faz isso): pelo navegador
    do próprio VPS via VNC (`./preparar-sessao-vnc.sh` + túnel SSH) ou no seu computador
    (`pnpm caixa:preparar-sessao`) e copiar o `estado.json` para o VPS. Passo 8 do LEIAME.
13. ☐ No `.env`: `FONTE=caixa-navegador`, `CAIXA_CONTA_DEDICADA=true`. `docker compose up -d worker` e
    acompanhe `docker compose logs -f worker`. Se a sessão expirar, o coletor para e avisa: repita o passo 12.
14. ☐ **Gravar uma abertura real** (21:45, ou 11:45 no domingo) e medir a ordem dentro da fila:
    `pnpm observar-abertura` e `pnpm analisar-abertura` (README). Ajuste `VITRINE_ORDEM` se ele recomendar.

## 5. WordPress como porta de entrada

15. ☐ No painel: **Equipe › Integração com o seu site › Criar chave** (copie).
16. ☐ No WordPress: **Plugins › Adicionar novo › Enviar plugin** com `radar-loterico.zip`
    ([no repositório](../integracoes/wordpress/radar-loterico.zip) ou na release "pacotes"), ative.
17. ☐ **Configurações › Radar Lotérico**: `https://radar.nassatech.com.br` + a chave › Salvar › **Testar conexão**.
18. ☐ Crie uma página (ex.: "Nossa lotérica") com blocos Shortcode: `[radar_painel]`,
    `[radar_boloes loja="2894"]`, `[radar_raio_x loterica="2894"]`, `[radar_ranking uf="SP" cidade="São Paulo"]`.
19. ☐ (Opcional) site público em iframe: no `.env` do VPS,
    `RADAR_EMBED_ORIGENS=https://nassatech.com.br https://www.nassatech.com.br` e `docker compose up -d web`;
    no WordPress, `[radar_boloes loja="2894" modo="iframe"]`.

## 6. Demonstração num subdomínio comum (opcional)

20. ☐ Baixe `radar-loterico-demo.zip` da release **pacotes** do GitHub (gerada sozinha a cada mudança).
21. ☐ hPanel › Subdomínios: crie `demo`; no Gerenciador de Arquivos, envie o zip para a pasta do subdomínio e
    **Extrair**; ative o SSL. Abra `https://demo.nassatech.com.br/`. (Para uma subpasta, rode o workflow
    "Pacotes" à mão com o caminho, ex.: `/radar-demo`.)

## 7. Rotina

- Backup automático todo dia às 03:30 (`/opt/radar/deploy/hostinger-vps/backups`, 14 dias). ☐ Configure uma
  cópia para fora do VPS (rclone + `BACKUP_RCLONE_DESTINO`) ou baixe um backup por semana.
- Atualizar: `cd /opt/radar/deploy/hostinger-vps && ./atualizar.sh`.
- Hostinger: ative também o **snapshot/backup semanal do VPS** no hPanel (proteção extra do servidor inteiro).
