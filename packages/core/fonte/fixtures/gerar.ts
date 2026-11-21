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

// 4) FORMATO BRUTO da CAIXA (estrutura observada no portal em 21/11/2026), vitrine da cidade de
//    São Paulo para a Mega-Sena 3089: 480 bolões em 16 páginas. Lotéricas fictícias.
{
  const { criarAleatorio } = await import('../../util/aleatorio');
  const { codigoBolaoCaixa, paraItemBrutoCaixa, respostaBoloesCaixa } = await import('../../simulacao/bruto-caixa');
  const { custoJogo } = await import('../../dominio/modalidades');
  type BF = import('../tipos').BolaoFonte;
  const rnd = criarAleatorio(3089);
  const A = ['Sorte', 'Trevo', 'Estrela', 'Fortuna', 'Ponto', 'Casa', 'Canto', 'Recanto', 'Mundo', 'Rota', 'Vila', 'Porto', 'Lar'];
  const B = ['Grande', 'de Ouro', 'Feliz', 'da Sorte', 'Premiada', 'Certa', 'Nova', 'Central', 'do Bairro', 'Real', 'Azul'];
  const nomes: string[] = [];
  for (const a of A) for (const b of B) nomes.push(`Loterica ${a} ${b}`);
  const formatos: [number, number, number][] = [[9, 4, 100], [7, 10, 10], [8, 5, 20], [9, 2, 24], [10, 1, 30], [8, 10, 40], [7, 6, 6], [11, 1, 66]];
  const sorteioEm = horarioSP(2026, 11, 22, 21, 0);
  type Linha = { b: BF; fila: number; chegada: number };
  const linhas: Linha[] = [];
  let seq = 0;
  let total = 0;
  for (let i = 0; total < 480; i++) {
    const loterica = { codigoCaixa: String(990000 + i * 7 + 13), nome: nomes[i % nomes.length]!, cidade: 'SAO PAULO', uf: 'SP' };
    const n = Math.min(480 - total, rnd.ponderado([[1, 30], [2, 25], [3, 20], [5, 15], [8, 10]] as const));
    let t = rnd.proximo() * 3600_000;
    for (let f = 1; f <= n; f++) {
      const [dezenas, jogos, cotas] = i === 0 && f === 1 ? [9, 4, 100] : rnd.escolher(formatos);
      const custo = (custoJogo('mega-sena', dezenas) ?? 6) * jogos;
      const base = Math.round((custo / cotas) * 100) / 100;
      seq++;
      const id = i === 0 && f === 1 ? 'MjAyNjsxMTs2MzAyOTE2MDI7MTA3OTU7' : codigoBolaoCaixa(2026, 11, 630291602 + seq * 37, 10795 + seq);
      const disp = i === 0 && f === 1 ? 97 : Math.max(1, cotas - Math.floor(rnd.proximo() * cotas * 0.6));
      linhas.push({
        b: { idCaixa: id, loterica, modalidade: 'mega-sena', concurso: 3089, jogos, dezenas, cotasTotal: cotas, cotasDisponiveis: disp, valorCotaBase: base },
        fila: f,
        chegada: i === 0 && f === 1 ? -1 : t,
      });
      t += 5_000 + rnd.exponencial(60_000);
      total++;
    }
  }
  linhas.sort((x, y) => x.fila - y.fila || x.chegada - y.chegada);
  const agora = horarioSP(2026, 11, 21, 1, 20, 12, 345);
  for (const pg of [1, 2, 3, 16]) {
    const itens = linhas.slice((pg - 1) * 30, pg * 30).map((l) => paraItemBrutoCaixa(l.b, { fila: l.fila, sorteioEm, premioEstimado: 3_500_000 }));
    salvar(`caixa/recuperar-boloes-disponiveis-mega-sena-3089-sao-paulo-pagina-${String(pg).padStart(2, '0')}.json`,
      respostaBoloesCaixa(itens, { pagina: pg, totalRegistros: linhas.length, agora: new Date(agora.getTime() + pg * 2300) }));
  }
  const ex = linhas.find((l) => l.b.idCaixa === 'MjAyNjsxMTs2MzAyOTE2MDI7MTA3OTU7')!;
  const det = paraItemBrutoCaixa(ex.b, { fila: ex.fila, sorteioEm, premioEstimado: 3_500_000 });
  salvar('caixa/detalhar-bolao-exemplo.json', {
    versao: '2.99.10.43',
    dataHoraServidor: '2026-11-21T01:21:04.512',
    payload: {
      ...det,
      lotericaFormatada: `${String(det.loterica).slice(0, 2)}.${String(det.loterica).slice(2)}`,
      municipioCota: 'SAO PAULO',
      apostas: [
        { numeros: [3, 11, 17, 24, 30, 38, 42, 51, 59] },
        { numeros: [5, 9, 14, 22, 27, 33, 41, 48, 60] },
        { numeros: [1, 8, 16, 19, 25, 36, 44, 52, 57] },
        { numeros: [2, 6, 13, 21, 29, 35, 40, 47, 55] },
      ],
    },
  });
}
