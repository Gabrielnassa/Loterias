# Fonte: Marketplace de Bolões da CAIXA (Fase 0)

## Situação em 21/11/2026

**A Fase 0 não foi concluída.** A partir do ambiente de desenvolvimento (container em nuvem), a
política de rede recusou a conexão com todos os hosts da CAIXA que tentei (o proxy do ambiente
respondeu `403` ao `CONNECT`; nenhuma requisição chegou à CAIXA):

| Host | Resultado |
| --- | --- |
| `www.loteriasonline.caixa.gov.br` | bloqueado pela rede do ambiente |
| `loteriasonline.caixa.gov.br` | bloqueado pela rede do ambiente |
| `loterias.caixa.gov.br` | bloqueado pela rede do ambiente |
| `servicebus2.caixa.gov.br` | bloqueado pela rede do ambiente |

Seguindo a instrução de não insistir, **nada sobre o formato real foi verificado**. Em vez disso:

- contrato do adaptador da fonte (formato normalizado): `packages/core/fonte/tipos.ts`;
- teste de contrato (zod) que detecta mudança de formato: `packages/core/fonte/contrato.ts`;
- varredura paginada, deduplicação e leitura parcial: `packages/core/fonte/varredura.ts`;
- cliente HTTP "educado" (intervalo mínimo, backoff com jitter, `Retry-After`, para em 401/403/captcha): `packages/core/fonte/cliente-http.ts`;
- monitor de saúde (alerta após 3 falhas seguidas, mudança de formato ou bloqueio): `packages/core/fonte/saude.ts`;
- adaptador da CAIXA em **esqueleto** (lança `FonteNaoMapeadaError`): `packages/core/fonte/adaptadores/caixa-http.ts`;
- fixtures **sintéticas** no formato normalizado: `packages/core/fonte/fixtures/`;
- prova de conceito que baixa 3 páginas: `FONTE=fixture pnpm poc:fonte` (já funciona com as fixtures; com `FONTE=caixa` funcionará quando o adaptador for implementado).

## O que se sabe por conhecimento público (NÃO verificado daqui)

- O Marketplace fica no portal Loterias Online (`www.loteriasonline.caixa.gov.br`, uma aplicação
  web de página única) e no app Loterias CAIXA, desde 20/05/2024 (SPEC).
- Projetos públicos usam `servicebus2.caixa.gov.br/portaldeloterias/api/{modalidade}/{concurso}`
  para **resultados** oficiais. Isso serve à Conferência (Fase 3), não à lista de bolões. Confirmar.
- Não sei se a lista de bolões é pública ou se exige login (CPF). **Se exigir login, isso muda o
  projeto** (credenciais, termos de uso, LGPD) e precisa ser decidido antes de seguir.

## Perguntas que a Fase 0 precisa responder

| # | Pergunta | Por que importa |
| --- | --- | --- |
| 1 | Quais chamadas devolvem a lista de bolões (URL, método, JSON/HTML/GraphQL)? | Implementar `FonteCaixaHttp.pagina` |
| 2 | Precisa de login, cookie de sessão, token, captcha ou há proteção anti-robô (WAF)? | Se houver barreira, **não burlar**: parar e decidir |
| 3 | Paginação: parâmetro, tamanho da página (30?), dá para pedir páginas maiores? Vem total de itens/páginas? | Custo de cada leitura |
| 4 | A ordem devolvida é a da vitrine (fila, chegada)? Existe ordenação por "mais recentes"? | Colocação observada x calculada; estratégia dos 5 s |
| 5 | Filtros disponíveis: modalidade, concurso, UF, cidade, lotérica, faixa de preço | Leitura por UF; ficha da lotérica |
| 6 | Campos: id do bolão (é estável?), código/nome da lotérica, cidade, UF, bairro, modalidade, concurso, jogos, dezenas, cotas totais e disponíveis | Mapeamento para `BolaoFonte` |
| 7 | O valor da cota vem **com ou sem** a tarifa de 35%? | `valorCotaBase` e todo o financeiro |
| 8 | Existe data/hora de inserção do bolão ou fila/posição explícita na resposta? | Se existir, a precisão deixa de depender da frequência (`inseridoEmFonte`) |
| 9 | Os números dos jogos vêm na lista ou numa chamada de detalhe? | `bolao_jogos`, Conferência |
| 10 | Há chamada que lista concursos abertos (data do sorteio, fechamento das vendas, prêmio)? | `concursosAbertos`, `fecha_em`, T0 |
| 11 | Há chamada barata de contagem por modalidade? | Modo normal a cada 60 s |
| 12 | Limites: 429, `Retry-After`, CDN/cache, `ETag`/`If-None-Match` | Ritmo seguro; leituras condicionais baratas |
| 13 | Na abertura (21:45): o concurso novo aparece antes de T0? Bolões esgotados somem ou ficam com 0? | Janela de abertura; inferência de "esgotou" |
| 14 | Quando um bolão anterior da lotérica esgota, os seguintes mudam de fila? | Fila estática (implementada) x dinâmica |
| 15 | Termos de uso e `robots.txt` | Validar com advogado antes de vender (SPEC, Riscos) |

## Risco principal: custo da leitura a cada 5 segundos

Uma leitura "completa" percorre todas as páginas do concurso. Na primeira hora de uma abertura
grande isso pode passar de 100 páginas (a SPEC cita a Mega-Sena 3.089 com a 1ª fila ocupando as
págs. 1 a 70; a Mega da Virada tem ~3.300 páginas). Com o intervalo mínimo padrão de 250 ms entre
requisições (~4 req/s), 70 páginas levam ~18 s, então **não cabem num slot de 5 s**: o agendador
pula slots e os conta em `slotsPerdidos`. Ler tudo a cada 5 s seria também uso irresponsável da
fonte. Estratégias para escolher depois de mapear a fonte:

1. **Ordenação "mais recentes"** (se existir): 1 ou 2 páginas por leitura bastam para achar os novos.
2. **Leitura pelas bordas das filas**: bolão novo sempre entra no FIM da sua fila. O coletor já
   sabe quantos bolões há em cada fila, então sabe em que página cada fila termina; basta ler essas
   páginas (≈ número de filas, 5 a 10 na 1ª hora) e fazer a leitura completa com menos frequência.
3. **Leitura por UF**, só para as UFs dos clientes.
4. **Data de inserção na resposta** (pergunta 8): resolve a precisão sem aumentar a frequência.
5. **Requisições condicionais** (`ETag`) para páginas que não mudaram.

Hoje está implementada a leitura completa com teto de páginas (`COLETA_MAX_PAGINAS_ABERTURA=200`).

## O que preciso de você: um HAR do portal

1. Abra o Chrome ou Edge numa janela anônima, aperte F12 e vá na aba **Network (Rede)**. Marque
   **Preserve log** e **Disable cache**.
2. Entre no Loterias Online e vá até a área de bolões do Marketplace.
3. Navegue: abra a lista de uma modalidade (ex.: Lotofácil), vá para as páginas 2 e 3, filtre por
   UF e por cidade, abra o detalhe de um bolão e troque de modalidade.
4. Se der, repita por 2 ou 3 minutos perto das 21:45 (abertura).
5. Exporte com **Export HAR (sanitized)** (o Chrome recente remove cookies e `Authorization`).
6. **Não precisa fazer login.** Se a lista exigir login, só me diga isso (já é uma resposta
   importante). Um HAR com login traz CPF, nome e token de sessão: nunca envie sem sanitizar.
7. Coloque o arquivo em `docs/har/` (está no `.gitignore`, não vai para o git) ou anexe na conversa.

Alternativa: liberar os hosts acima na rede do ambiente (configurações do ambiente, Network access,
Allowed domains). Mesmo assim o HAR é o melhor primeiro passo: o portal é uma aplicação JavaScript
e as chamadas podem depender de tokens gerados pela página.

## Como plugar a fonte real depois

1. Implementar `concursosAbertos`, `contagens` e `pagina` em `FonteCaixaHttp`, usando
   `ClienteHttpEducado.obter(url, { esperaJson: true })`.
2. Escrever `normalizarBolao(bruto)` para converter o formato bruto em `BolaoFonte`.
3. Guardar respostas reais **anonimizadas** em `packages/core/fonte/fixtures/caixa/` e criar o
   teste de contrato bruto -> normalizado (se a CAIXA mudar o formato, ele quebra no CI).
4. Rodar `FONTE=caixa pnpm poc:fonte` (3 páginas, com limite de requisições e backoff).
5. Escolher a estratégia de leitura da abertura (seção acima) e ajustar `COLETA_*`.
