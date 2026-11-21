# Fonte: Marketplace de Bolões da CAIXA (Fase 0)

## Situação em 21/11/2026

| Data | O que aconteceu |
| --- | --- |
| 21/11, 00:30 | Rede do ambiente de desenvolvimento bloqueava a CAIXA. Criados contrato, cliente HTTP, fixtures sintéticas. |
| 21/11, 01:20 | O Gabriel inspecionou o portal no navegador dele (logado) e passou os achados abaixo (no lugar do HAR). |
| 21/11, 01:30 | Rede liberada. Daqui: o portal responde, o Chromium headless carrega sem desafio anti-robô e cai na pergunta "Você tem mais de 18 anos?". O código JavaScript do próprio portal foi lido (só leitura) para entender rotas e parâmetros. |

**Decisões de segurança (obrigatórias):**

- O parâmetro `q` das requisições é cifrado no navegador (node-forge). **Não reproduzir, contornar nem
  decifrar.** A estratégia é o adaptador `caixa-navegador`: um navegador real (Playwright) abre a página
  como um usuário comum, pagina pelo botão "Seguinte" e lê as respostas JSON que o próprio site pede.
- A pergunta **"Você tem mais de 18 anos?"** e qualquer aceite de termos são respondidos **por uma
  pessoa**, nunca pelo robô. O operador prepara a sessão uma vez com
  `pnpm caixa:preparar-sessao` (abre uma janela; ele responde; a sessão é salva em `.sessao-caixa/`,
  fora do git). Sem essa sessão o adaptador para com `ConfirmacaoHumanaNecessariaError`.
- **Não automatizar com a conta pessoal de ninguém.** O adaptador nunca faz login.
- Proteção anti-robô (os cookies `__uzma`, `__uzmb`, `__uzmc`, `__uzmd`, `__uzme` indicam um
  gerenciador de bots): 401, 403, captcha ou desafio param a coleta na hora (`BloqueadoPelaFonteError`),
  com alerta. Nada de "stealth", troca de user-agent ou resolução de captcha.

## API observada

- Base: `https://www.loteriasonline.caixa.gov.br/silce-servico-rest/rest/v1/{caminho em base64}/`
- Caminhos (base64 decodificado):

| Caminho | Método | Observação |
| --- | --- | --- |
| `parametros/bolao-caixa` | GET | parâmetros do bolão |
| `usuarios/recuperar-dados` | GET | usa a sessão do usuário logado |
| `boloes/recuperar-boloes-disponiveis` | GET `?q=` | **a lista de bolões** (q cifrado) |
| `boloes/recuperar-boloes-disponiveis-link` | GET `?q=` | lista pelo link público da lotérica (`#/bolao-caixa/{código}`) |
| `boloes/detalhar-bolao` | GET | mesmos dados + `apostas` (os jogos), `lotericaFormatada`, `municipioCota` |
| `parametros/configuraveis-web`, `parametros-simulacao/datahora-servidor` | GET | públicos; o 2º dá a hora do servidor (útil para medir desvio de relógio) |

- Resposta em JSON aberto. Envelope:
  `{versao, dataHoraServidor, payload: {totalRegistros, paginaAtual, ultimaPagina, valorMenorCota, contemResiduo, cotas: [...]}}`.
  30 bolões por página. `dataHoraServidor` vem no horário de São Paulo **sem fuso** ("2026-11-21T01:18:30.949").
- Campos de cada item de `cotas`: `index, codigoBolao, qtdCotaDigital, qtdCotaTotal, qtdCotaDisponivel,
  loterica (código numérico), nomeFantasia, nomeRazaoSocial, numeroUF, uf{sigla,id,nome}, idMunicipio,
  municipio{id{codigoUF,numero,digitoVerificador},uf,nome}, concurso, tipoConcurso, idModalidade,
  modalidade ("MEGA_SENA"), dataSorteio ("22/11/2026"), horaSorteio, diaSorteio, vrPremioEstimado,
  vrCotaSemTarifa, vrCotaComTarifa, valorTarifaServico, vrUltimaCotaSemTarifa, vrUltimaCotaComTarifa,
  vrTarifaServicoUltimaCota, qtdApostas, qtdNumeros, qtdTrevos, qtdSimplesLoteca, qtdDuplosLoteca,
  qtdTriplosLoteca, contemResiduo, lotericaFavorita`.
- `codigoBolao` = base64 de `"ano;mês;número;lote;"` (ex.: `MjAyNjsxMTs2MzAyOTE2MDI7MTA3OTU7` =
  `2026;11;630291602;10795;`). Usado como id estável.
- Exemplo real: cota R$ 20,16 sem tarifa, R$ 27,21 com tarifa, tarifa R$ 7,05; 4 apostas de 9 números;
  97/100 cotas disponíveis. Confere: 4 × C(9,6)=84 × R$ 6,00 = R$ 2.016 / 100 cotas = R$ 20,16. A tarifa
  é **truncada** em centavos (35% × 20,16 = 7,056 → 7,05); o financeiro usa essa regra.

## Parâmetros da lista (lidos no JavaScript do portal, sem decifrar nada)

Antes de cifrar, o portal monta `{tipoConsulta, idMunicipio, idUf, pagina, qtdPorPagina, numeroLoterico, ...filtros}`:

| tipoConsulta | Escopo |
| --- | --- |
| 0 | município do comprador |
| 1 | UF |
| 2 | Brasil (nacional) |
| 3 | lotérica específica (link público `#/bolao-caixa/{código}`) |

Quando a lista da cidade acaba, o próprio portal continua para a UF (1) e depois para o Brasil (2) —
por isso a vitrine que um comprador vê é "cidade, depois estado, depois Brasil".

Rotas da aplicação (AngularJS): `#/bolao-caixa/{modalidade}` (lista geral) e `#/bolao-caixa/{código}`
(link da lotérica). A rota geral **exige login**: sem usuário logado o portal volta para a home. O link
da lotérica **não exige login**. Antes de tudo, quem não está logado passa pela pergunta de idade.

## Respostas às perguntas da Fase 0

| # | Pergunta | Resposta |
| --- | --- | --- |
| 1 | Quais chamadas devolvem a lista? | `boloes/recuperar-boloes-disponiveis` (e `-link`), JSON |
| 2 | Login, token, captcha, anti-robô? | Lista geral exige login; link da lotérica não. Pergunta de idade para quem não está logado. Há gerenciador anti-robô (cookies `__uzm*`); até agora sem desafio no Chromium headless. `q` cifrado. |
| 3 | Paginação | 30 por página; `paginaAtual`, `ultimaPagina`, `totalRegistros` no JSON; Anterior/Seguinte na tela |
| 4 | Ordem = vitrine? | É a ordem da tela (fila, chegada), mas **por cidade do comprador** e depois UF/Brasil. Até confirmar a semântica, a colocação vem da regra (fila + first_seen_at); a ordem observada fica guardada |
| 5 | Filtros | modalidade, lotérica (nome ou código de 6 dígitos), valor mínimo/máximo da cota, cotas, apostas, dezenas, números que quer/não quer; ordenação por apostas, cotas disponíveis e valor |
| 6 | Campos | ver acima; tudo o que o sistema precisa existe |
| 7 | Cota com ou sem tarifa? | Os dois (`vrCotaSemTarifa`, `vrCotaComTarifa`) e a tarifa (`valorTarifaServico`) |
| 8 | Hora de inclusão do bolão? | **Não existe**. first_seen_at continua vindo da observação |
| 8b | Fila explícita? | **Sim: `index`** (nas págs. 2 e 3 todos tinham index 1 e nenhuma lotérica se repetia). Usado como fila observada; a calculada também é guardada |
| 9 | Números dos jogos | `detalhar-bolao` → `apostas` (formato exato a confirmar; o normalizador aceita listas ou objetos com `numeros`) |
| 10 | Concursos abertos | Vêm nos itens (`concurso`, `dataSorteio`, `horaSorteio`, `vrPremioEstimado`); não há chamada separada conhecida |
| 11 | Contagem barata | `totalRegistros` da 1ª página (no escopo da consulta) |
| 12 | Limites (429, ETag) | Não observado. O adaptador usa ritmo baixo (3 s entre ações por padrão) e backoff |
| 13 | Abertura 21:45 | Não observado ainda |
| 14 | Fila dinâmica? | Ainda não sabemos: guardamos `fila_observada_entrada` e `fila_observada` (atual); se divergirem, a fila é dinâmica |
| 15 | Termos de uso | Validar com advogado antes de vender (SPEC, Riscos) |

## Modos de coleta decididos (21/11/2026)

| Modo | Configuração | O que dá |
| --- | --- | --- |
| Conta DEDICADA da empresa | `FONTE=caixa-navegador`, `CAIXA_CONTA_DEDICADA=true`, sessão em `CAIXA_SESSAO` (arquivo) ou `CAIXA_SESSAO_JSON` (base64) | Lista geral (cidade da conta → UF → Brasil): fila, hora de entrada e colocação calculada |
| Links públicos das lotéricas monitoradas (sem conta) | `FONTE=caixa-links`, `CAIXA_LOTERICAS=990013,990020` | Fila e hora de entrada dos bolões dessas lotéricas; colocação na vitrine **indisponível** (`aberturas.escopo_colocacao = 'monitoradas'`) |

- Uma pessoa faz o login da conta dedicada UMA vez em `pnpm caixa:preparar-sessao`; só os cookies
  da sessão são guardados (a senha não). Credenciais e sessão só por variável de ambiente ou arquivo
  fora do git — nunca no repositório. Nunca usar a conta pessoal do Gabriel.
- Sessão expirada: o portal volta para a home, o robô para com `SessaoExpiradaError` e alerta
  (`acao_humana`). Quando a pessoa renova o arquivo de sessão, o adaptador percebe e volta sozinho.

## Estratégia de leitura na abertura

5 s até T0 + 30 min (janela de participação) e 15 s até T0 + 60 min. Leitura completa enquanto couber
em 5 s; quando passar, só as páginas onde termina a 1ª fila (+1), porque o 1º bolão de cada lotérica
entra no fim da 1ª fila; uma leitura completa a cada 60 s pega os demais bolões e as vendas. No
navegador, reler a borda custa 2 ações ("Anterior" + "Seguinte") sem voltar à página 1.

## O que falta descobrir

1. Observar uma abertura real com `pnpm observar-abertura` (instruções no README da raiz) e decidir
   os números da estratégia (intervalo entre ações, margem de páginas, frequência da leitura completa).
2. Se `ultimaPagina` é o número da última página (o código do portal sugere que sim).
3. Se, com login, ao passar da última página da cidade, a lista da UF inclui ou exclui a cidade.
4. Comportamento às 21:45 (o concurso novo aparece antes de T0? em lote?) e se esgotados somem.
5. T0 por concurso: o portal mostra "abre dom 22/11 11:45" (Mega 3.090) e "abre qui 26/11 21:45"
   (Lotofácil 3.840). Falta achar de onde vem essa informação (se há campo na API); hoje o T0 é previsto
   pelas regras editáveis e ajustado pelo 1º bolão visto.

## Como rodar o adaptador

```bash
pnpm caixa:preparar-sessao              # uma pessoa responde a pergunta de idade (e, se decidido, faz login na conta DEDICADA)
FONTE=caixa-navegador CAIXA_MODALIDADES=mega-sena pnpm poc:fonte   # baixa até 3 páginas
```

No VPS: `docker compose up -d --build worker` com `FONTE=caixa-navegador` e o arquivo de sessão em
`./.sessao-caixa/estado.json` (a sessão é preparada num computador com tela e copiada).
Teste ao vivo daqui (21/11, sem sessão): o adaptador carregou o portal e parou corretamente em
"o portal pediu a confirmação de maioridade", sem clicar em nada.

## Arquivos

- Contrato bruto e normalizador: `packages/core/fonte/adaptadores/caixa-bruto.ts`
- Fixtures com a estrutura real (lotéricas fictícias): `packages/core/fonte/fixtures/caixa/`
- Adaptador de navegador: `apps/worker/src/fontes/caixa-navegador.ts`; testes contra um portal falso local em `apps/worker/test/`
- Preparar sessão: `apps/worker/src/caixa-preparar-sessao.ts`

## API de resultados (conferida em 21/11/2026)

`GET https://servicebus2.caixa.gov.br/portaldeloterias/api/{megasena|lotofacil|quina|lotomania|duplasena|timemania|diadesorte|supersete|maismilionaria|loteca}/{concurso}`
(sem o concurso, devolve o último). Pública, sem login. Fixtures reais em `packages/core/fonte/fixtures/resultados/`.

- `tipoJogo`: MEGA_SENA, LOTOFACIL, QUINA, LOTOMANIA, DUPLA_SENA, TIMEMANIA, DIA_DE_SORTE, MAIS_MILIONARIA, LOTECA.
- `listaRateioPremio[].descricaoFaixa`: "4 acertos"; +Milionária "5 acertos + 2 trevos" / "+ 1 ou nenhum trevo" /
  "+ 1 trevo"; Timemania "Time do Coração"; Dia de Sorte "Mês da Sorte"; Loteca "1º (14 acertos)".
- Dupla Sena: 8 faixas, as 4 do 1º sorteio e depois as 4 do 2º, com a MESMA descrição; 2º sorteio em
  `listaDezenasSegundoSorteio`.
- `trevosSorteados` (+Milionária); `nomeTimeCoracaoMesSorte` = "CUIABA           /MT" ou "Junho"; nas outras
  modalidades vem cheio de bytes nulos (`\u0000`), que o jsonb do PostgreSQL recusa (limpar antes de gravar).
- Loteca: `listaDezenas` nulo; `listaResultadoEquipeEsportiva[]` com `nuSequencial` (1 a 14), times, gols,
  `icSorteioResultado` e `resultado` (jogo não realizado: coluna sorteada; formato ainda não visto).
- Lotomania: 20 dezenas de "00" a "99"; faixa "0 acertos".
- Super Sete: devolveu HTTP 500 (erro interno da CAIXA, 412 do gateway) no último concurso e no 920;
  presumido `dezenasSorteadasOrdemSorteio` na ordem das colunas.
