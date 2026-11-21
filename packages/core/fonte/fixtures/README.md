# Fixtures da fonte

**Dados sintéticos**, gerados por `gerar.ts` a partir do simulador (`packages/core/simulacao`).
Lotéricas e códigos são fictícios (os códigos começam com `99`).

Estão no **formato normalizado** do adaptador (`BolaoFonte`, `PaginaBoloes` em `../tipos.ts`), não
no formato bruto da CAIXA, que ainda é desconhecido (ver `docs/fonte-caixa.md`). Quando a Fase 0
for concluída, respostas reais **anonimizadas** vão para `caixa/` com um teste de contrato
bruto -> normalizado.

| Arquivo | Conteúdo |
| --- | --- |
| `lotofacil-3880-abertura-21h50.json` | Vitrine da Lotofácil 5 min depois da abertura (T0 + 5 min), na ordem da vitrine |
| `mega-sena-3105-domingo-14h.json` | Vitrine da Mega-Sena no meio do dia seguinte, com vendas em andamento |
| `pagina-exemplo.json` | Uma página isolada (`PaginaBoloes`) para o teste de contrato |

Regenerar: `pnpm --filter @radar/core exec tsx fonte/fixtures/gerar.ts`
