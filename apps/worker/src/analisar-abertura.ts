/**
 * Analisa a gravação de uma abertura (`pnpm observar-abertura`) e responde: dentro da 1ª fila, a
 * vitrine segue a ORDEM DE CHEGADA (hipótese da SPEC) ou não (a circular da CAIXA fala em ordem
 * aleatória)? Para cada leitura completa: quedas de fila, trocas entre as filas 1 e 2 e a correlação
 * entre a posição na 1ª fila e a chegada (1ª vez que o bolão apareceu) e o número do bolão.
 *
 *   pnpm analisar-abertura -- apps/worker/observacoes/abertura-mega-sena-2026-11-22-1145.jsonl
 */
import { readFileSync } from 'node:fs';
import { diagnosticarOrdem, mediana, type DiagnosticoOrdem } from '@radar/core';

interface LinhaPagina {
  tipo: 'pagina';
  leitura: number;
  pagina: number;
  inicio: string;
  ordem?: [number | string, number | null][];
}

export function analisarGravacao(conteudo: string): { leituras: { leitura: number; diagnostico: DiagnosticoOrdem }[]; resumo: Record<string, unknown> } {
  const paginas = conteudo
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { tipo: string })
    .filter((l): l is LinhaPagina => l.tipo === 'pagina' && Array.isArray((l as LinhaPagina).ordem));
  const chegada = new Map<string, number>();
  const porLeitura = new Map<number, LinhaPagina[]>();
  for (const p of paginas.sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const t = Date.parse(p.inicio);
    for (const [id] of p.ordem!) if (!chegada.has(String(id))) chegada.set(String(id), t);
    porLeitura.set(p.leitura, [...(porLeitura.get(p.leitura) ?? []), p]);
  }
  const leituras = [...porLeitura.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([leitura, ps]) => {
      const itens = ps
        .sort((a, b) => a.pagina - b.pagina)
        .flatMap((p) => p.ordem!)
        .filter(([, fila]) => fila !== null)
        .map(([id, fila]) => ({ fila: fila!, chegada: chegada.get(String(id)) ?? null, numeroBolao: typeof id === 'number' ? id : null }));
      return { leitura, diagnostico: diagnosticarOrdem(itens) };
    })
    .filter((l) => l.diagnostico.itens > 0);
  const rhos = leituras.map((l) => l.diagnostico.spearmanChegadaNaFila1).filter((x): x is number => x !== null);
  const conclusoes = leituras.reduce<Record<string, number>>((a, l) => ({ ...a, [l.diagnostico.conclusao]: (a[l.diagnostico.conclusao] ?? 0) + 1 }), {});
  return {
    leituras,
    resumo: {
      leituras: leituras.length,
      spearmanChegadaMediano: mediana(rhos),
      quedasDeFilaMedianas: mediana(leituras.map((l) => l.diagnostico.quedasDeFila)),
      conclusoes,
      leitura:
        rhos.length === 0
          ? 'sem dados de ordem na gravação (grave de novo com a versão atual do observar-abertura)'
          : (mediana(rhos) ?? 0) >= 0.8
            ? 'a 1ª fila segue a ordem de chegada: mantenha VITRINE_ORDEM=fila-chegada'
            : 'a 1ª fila NÃO segue a ordem de chegada: use VITRINE_ORDEM=fila-aleatoria e reveja a colocação',
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arquivo = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!arquivo) {
    console.error('uso: pnpm analisar-abertura -- <arquivo.jsonl>');
    process.exit(2);
  }
  const r = analisarGravacao(readFileSync(arquivo, 'utf8'));
  for (const l of r.leituras) console.log(JSON.stringify({ leitura: l.leitura, ...l.diagnostico }));
  console.log(JSON.stringify({ resumo: r.resumo }, null, 2));
}
