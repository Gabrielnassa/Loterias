# Plugin WordPress "Radar Lotérico"

O site WordPress (por exemplo, o da Hostinger) vira a porta de entrada do sistema, que roda no VPS
(`deploy/hostinger-vps`). O plugin lê a **API pública** do sistema com a chave da sua conta e guarda as
respostas em cache (transients); se o sistema cair, mostra a última informação boa.

**Instalável:** [`radar-loterico.zip`](radar-loterico.zip). Para gerar de novo, depois de mudar o código:
`./empacotar.sh`.

Testado em 22/11/2026 num WordPress 6.8 (PHP 8.3) em Docker, lendo um Radar real (stack de produção):
instalação pelo .zip, "Testar conexão", os 4 shortcodes numa página, cache e desinstalação.

## Instalar

1. No painel do Radar: **Equipe › Integração com o seu site › Criar chave** (copie: ela só aparece uma vez).
2. No WordPress: **Plugins › Adicionar novo › Enviar plugin** › `radar-loterico.zip` › Ativar.
3. **Configurações › Radar Lotérico**: endereço `https://radar.nassatech.com.br`, a chave, **Salvar** e
   **Testar conexão** (deve aparecer "Conectado à conta ...").
4. Numa página, adicione um bloco **Shortcode** com um dos códigos abaixo.

## Shortcodes

| Código | O que mostra |
| --- | --- |
| `[radar_raio_x loterica="2894" semanas="4"]` | Raio-X de Abertura: aberturas, atraso mediano, melhor colocação, % na página 1, chance de abrir amanhã e as últimas entradas |
| `[radar_ranking uf="SP" cidade="São Paulo" limite="10" criterio="mais_aberturas"]` | Ranking da abertura (critérios: `mais_aberturas`, `mais_rapida`, `mais_pagina1`) |
| `[radar_boloes loja="2894" limite="12"]` | Bolões à venda da sua loja, com botão do WhatsApp (o número vem de Minha lotérica › Meu site) |
| `[radar_boloes loja="2894" modo="iframe" altura="900"]` | O site público da loja inteiro, dentro da página (exige `RADAR_EMBED_ORIGENS` no `.env` do sistema) |
| `[radar_painel texto="Entrar no painel" nova_aba="sim"]` | Botão para o login do painel |

`titulo="..."` troca o título dos três primeiros. Os números de terceiros são estimativas a partir da
vitrine pública da CAIXA (o rodapé avisa).

## API usada (para outras integrações)

`GET https://SEU-SISTEMA/api/publica/v1/{conta|raio-x|ranking|boloes}` com o cabeçalho
`Authorization: Bearer rl_...`. Limite de 120 chamadas por minuto por chave. Revogue uma chave em Equipe.
