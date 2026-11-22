=== Radar Lotérico ===
Contributors: radarloterico
Tags: loteria, lotérica, bolão, ranking
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Mostra no seu site o Raio-X de Abertura, o ranking da abertura e os bolões da sua lotérica, lidos do sistema Radar Lotérico.

== Description ==

O site WordPress vira a porta de entrada do Radar Lotérico (que roda num servidor próprio). Os dados vêm da API
pública do sistema, com a chave da sua conta, e ficam guardados em cache (transients) para o site continuar rápido.
Se o sistema ficar fora do ar, o plugin mostra a última informação boa.

Shortcodes (num bloco "Shortcode"):

* `[radar_raio_x loterica="2894" semanas="4"]`: Raio-X de Abertura de uma lotérica.
* `[radar_ranking uf="SP" cidade="São Paulo" limite="10" criterio="mais_aberturas"]`: ranking da abertura (critérios: mais_aberturas, mais_rapida, mais_pagina1).
* `[radar_boloes loja="2894"]`: bolões à venda da sua loja, com botão do WhatsApp. `modo="iframe" altura="900"` mostra o site público inteiro.
* `[radar_painel texto="Entrar no painel" nova_aba="sim"]`: botão para o painel.

Números de vendas, colocações e horários são estimativas a partir da vitrine pública do Marketplace da CAIXA.

== Installation ==

1. Plugins › Adicionar novo › Enviar plugin: escolha `radar-loterico.zip` e ative.
2. No painel do Radar Lotérico: Equipe › Integração com o seu site › Criar chave.
3. Configurações › Radar Lotérico: endereço do sistema (https://...) e a chave. Clique em "Testar conexão".
4. Para o modo iframe, o sistema precisa listar o seu site em RADAR_EMBED_ORIGENS.

== Changelog ==

= 1.0.0 =
* Primeira versão: Raio-X, ranking, bolões (lista ou iframe), botão do painel, cache e página de configurações.
