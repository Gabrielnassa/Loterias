/**
 * Gera as fixtures sintéticas desta pasta a partir do simulador (determinístico).
 *   pnpm --filter @radar/core exec tsx fonte/fixtures/gerar.ts
 * Formato = contrato NORMALIZADO do adaptador (fonte/tipos.ts), NÃO o formato bruto da CAIXA,
 * que ainda é desconhecido (ver docs/fonte-caixa.md).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gerarAberturaSimulada, vitrineEm } from '../../simulacao/abertura-simulada';
import { diaSP, horarioSP } from '../../tempo/fuso';

const AQUI = dirname(fileURLToPath(import.meta.url));
const AVISO =
  'DADOS SINTÉTICOS gerados pelo simulador (lotéricas e códigos fictícios, códigos começam com 99). ' +
  'Formato normalizado interno; não representa o JSON bruto da CAIXA.';

function salvar(nome: string, dados: unknown) {
  writeFileSync(join(AQUI, nome), JSON.stringify(dados, null, 2) + '\n');
  console.log('gerado', nome);
}

// 1) Lotofácil: vitrine 5 min depois da abertura de segunda 23/11/2026 21:45
{
  const t0 = horarioSP(2026, 11, 23, 21, 45);
  const sim = gerarAberturaSimulada({ semente: 3880, t0, modalidade: 'lotofacil', concurso: 3880, nBoloes: 200 });
  const em = new Date(t0.getTime() + 5 * 60_000);
  salvar('lotofacil-3880-abertura-21h50.json', {
    descricao: 'Lotofácil 3880, vitrine às 21:50:00 (T0 + 5 min) na ordem da vitrine',
    aviso: AVISO,
    capturadoEm: em.toISOString(),
    concurso: { modalidade: 'lotofacil', concurso: 3880, dataSorteio: diaSP(sim.fechaEm), fechaEm: sim.fechaEm.toISOString() },
    tamanhoPagina: 30,
    itens: vitrineEm(sim, em),
  });
}

// 2) Mega-Sena: vitrine no meio do dia seguinte, com vendas em andamento
{
  const t0 = horarioSP(2026, 11, 21, 21, 45);
  const sim = gerarAberturaSimulada({ semente: 3105, t0, modalidade: 'mega-sena', concurso: 3105, nBoloes: 120 });
  const em = horarioSP(2026, 11, 22, 14, 0);
  salvar('mega-sena-3105-domingo-14h.json', {
    descricao: 'Mega-Sena 3105, vitrine de domingo 22/11/2026 às 14:00, vendas em andamento',
    aviso: AVISO,
    capturadoEm: em.toISOString(),
    concurso: { modalidade: 'mega-sena', concurso: 3105, dataSorteio: diaSP(sim.fechaEm), fechaEm: sim.fechaEm.toISOString() },
    tamanhoPagina: 30,
    itens: vitrineEm(sim, em),
  });

  // 3) Uma página isolada no contrato PaginaBoloes (datas como ISO string)
  const itens = vitrineEm(sim, em);
  salvar('pagina-exemplo.json', {
    consulta: { modalidade: 'mega-sena', concurso: 3105, pagina: 2 },
    pagina: 2,
    tamanhoPagina: 30,
    totalItens: itens.length,
    totalPaginas: Math.ceil(itens.length / 30),
    itens: itens.slice(30, 60),
    ordemDaVitrine: true,
    obtidaEm: em.toISOString(),
  });
}
