# Fixtures da fonte

**Dados sintéticos**, gerados por `gerar.ts` a partir do simulador (`packages/core/simulacao`).
Lotéricas e códigos são fictícios (os códigos começam com `99`).

Os arquivos da raiz estão no **formato normalizado** do adaptador (`BolaoFonte`, `PaginaBoloes`).

A pasta `caixa/` tem o **formato bruto da CAIXA** (envelope e campos observados no portal em
21/11/2026, ver `docs/fonte-caixa.md`), com lotéricas fictícias e um bolão do exemplo real
(`MjAyNjsxMTs2MzAyOTE2MDI7MTA3OTU7`: 4 apostas de 9 números, R$ 20,16 / 27,21 / 7,05, 97/100).
Teste de contrato bruto -> normalizado: `packages/core/test/caixa-bruto.test.ts`.

Valores **palpites** (estrutura real, conteúdo não confirmado): `numeroUF`, `uf.id`, `uf.nome`,
`idMunicipio` e `municipio.id` (códigos IBGE), `tipoConcurso`, `idModalidade`, `horaSorteio`,
`diaSorteio` e o formato de `apostas` no `detalhar-bolao`. O normalizador não depende deles.

| Arquivo | Conteúdo |
| --- | --- |
| `lotofacil-3880-abertura-21h50.json` | Vitrine da Lotofácil 5 min depois da abertura (T0 + 5 min), na ordem da vitrine |
| `mega-sena-3105-domingo-14h.json` | Vitrine da Mega-Sena no meio do dia seguinte, com vendas em andamento |
| `pagina-exemplo.json` | Uma página isolada (`PaginaBoloes`) para o teste de contrato |
| `caixa/recuperar-boloes-disponiveis-mega-sena-3089-sao-paulo-pagina-NN.json` | Lista da cidade de São Paulo (480 bolões, 16 páginas): págs. 1, 2, 3 e 16 |
| `caixa/detalhar-bolao-exemplo.json` | Detalhe de um bolão com os jogos |

Regenerar: `pnpm --filter @radar/core exec tsx fonte/fixtures/gerar.ts`
