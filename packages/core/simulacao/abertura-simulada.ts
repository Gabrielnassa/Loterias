import { CONFIG_COLETA_PADRAO, type ConfigColeta } from '../coleta/plano';
import { custoJogo, type ModalidadeSlug } from '../dominio/modalidades';
import type { LotericaRef } from '../dominio/tipos';
import type { BolaoFonte } from '../fonte/tipos';
import type { ItemLeitura, LeituraVitrine } from '../fonte/varredura';
import { criarAleatorio, type Aleatorio } from '../util/aleatorio';

/**
 * Simulador de abertura com "verdade" conhecida (horário exato de chegada, fila real, vendas),
 * para testar o pipeline de ponta a ponta e rodar o worker sem a fonte real.
 * DADOS SINTÉTICOS: lotéricas e códigos são fictícios (códigos começam com 99).
 */

export interface BolaoVerdade {
  bolao: Omit<BolaoFonte, 'cotasDisponiveis'>;
  chegadaEm: Date;
  fila: number;
  /** Instantes (ms) de venda de cada cota, ordenados. */
  vendas: number[];
}

export interface AberturaSimulada {
  modalidade: ModalidadeSlug;
  concurso: number;
  t0: Date;
  fechaEm: Date;
  lotericas: LotericaRef[];
  boloes: BolaoVerdade[];
}

export interface OpcoesSimulacao {
  semente: number;
  t0: Date;
  nBoloes?: number;
  modalidade?: ModalidadeSlug;
  concurso?: number;
  fechaEm?: Date;
}

const CIDADES: readonly (readonly [string, string, number, readonly string[]])[] = [
  ['São Paulo', 'SP', 30, ['Centro', 'Mooca', 'Santana', 'Pinheiros', 'Tatuapé', 'Lapa', 'Ipiranga']],
  ['Campinas', 'SP', 7, ['Centro', 'Cambuí', 'Barão Geraldo']],
  ['Santos', 'SP', 4, ['Gonzaga', 'Boqueirão']],
  ['Ribeirão Preto', 'SP', 4, ['Centro', 'Jardim Irajá']],
  ['Rio de Janeiro', 'RJ', 14, ['Centro', 'Copacabana', 'Tijuca', 'Madureira', 'Barra da Tijuca']],
  ['Niterói', 'RJ', 3, ['Icaraí', 'Centro']],
  ['Belo Horizonte', 'MG', 9, ['Savassi', 'Centro', 'Pampulha']],
  ['Uberlândia', 'MG', 3, ['Centro', 'Santa Mônica']],
  ['Curitiba', 'PR', 6, ['Centro', 'Batel', 'Portão']],
  ['Salvador', 'BA', 6, ['Barra', 'Pituba', 'Centro']],
  ['Porto Alegre', 'RS', 5, ['Centro Histórico', 'Moinhos de Vento']],
  ['Recife', 'PE', 5, ['Boa Viagem', 'Centro']],
];

const NOMES_A = ['Sorte', 'Trevo', 'Estrela', 'Fortuna', 'Ponto', 'Casa', 'Canto', 'Recanto', 'Mundo', 'Rota'];
const NOMES_B = ['Grande', 'de Ouro', 'Feliz', 'da Sorte', 'Premiada', 'Certa', 'Nova', 'Central', 'do Bairro', 'Real'];

/** Formatos populares por modalidade: [dezenas, jogos, cotas]. */
const FORMATOS: Partial<Record<ModalidadeSlug, readonly (readonly [number, number, number])[]>> = {
  lotofacil: [
    [16, 10, 20], [16, 20, 40], [17, 6, 40], [17, 3, 20], [17, 10, 50], [18, 1, 50], [18, 2, 100], [16, 5, 10], [15, 30, 10], [16, 8, 16],
  ],
  'mega-sena': [
    [7, 10, 10], [8, 5, 20], [9, 2, 24], [10, 1, 30], [8, 10, 40], [7, 6, 6], [9, 4, 48], [11, 1, 66],
  ],
  quina: [
    [6, 10, 10], [7, 5, 15], [8, 2, 16], [7, 10, 30], [6, 20, 20], [9, 1, 12],
  ],
};

function gerarLotericas(rnd: Aleatorio, n: number): LotericaRef[] {
  const usados = new Set<string>();
  const lista: LotericaRef[] = [];
  for (let i = 0; i < n; i++) {
    const [cidade, uf, , bairros] = rnd.ponderado(CIDADES.map((c) => [c, c[2]] as const));
    let nome: string;
    do nome = `Lotérica ${rnd.escolher(NOMES_A)} ${rnd.escolher(NOMES_B)}`;
    while (usados.has(`${nome}|${cidade}`) && usados.size < NOMES_A.length * NOMES_B.length * CIDADES.length);
    usados.add(`${nome}|${cidade}`);
    lista.push({
      codigoCaixa: `99${String(100000 + i * 7919 + rnd.inteiro(0, 7000)).padStart(6, '0')}`,
      nome,
      cidade,
      uf,
      bairro: rnd.escolher(bairros),
    });
  }
  return lista;
}

/** Atraso (s) do 1º bolão da lotérica em relação a T0. */
function atrasoPrimeiroBolao(rnd: Aleatorio): number {
  const faixa = rnd.ponderado<readonly [number, number]>([
    [[0.5, 40], 30],
    [[40, 180], 25],
    [[180, 900], 20],
    [[900, 1800], 15],
    [[1800, 3600], 7],
    [[3600, 5400], 3],
  ]);
  return faixa[0] + rnd.proximo() * (faixa[1] - faixa[0]);
}

function quantosBoloes(rnd: Aleatorio): number {
  return rnd.ponderado([
    [1, 35],
    [2, 25],
    [3, 15],
    [rnd.inteiro(4, 6), 20],
    [rnd.inteiro(7, 10), 5],
  ]);
}

export function gerarAberturaSimulada(o: OpcoesSimulacao): AberturaSimulada {
  const rnd = criarAleatorio(o.semente);
  const modalidade = o.modalidade ?? 'lotofacil';
  const concurso = o.concurso ?? 3500;
  const nBoloes = o.nBoloes ?? 200;
  const t0 = o.t0.getTime();
  const fechaEm = o.fechaEm ?? new Date(t0 + 22 * 3_600_000);
  const formatos = FORMATOS[modalidade] ?? FORMATOS.lotofacil!;

  const lotericas: LotericaRef[] = [];
  const planos: { loterica: LotericaRef; chegadas: number[] }[] = [];
  let total = 0;
  const pool = gerarLotericas(rnd, Math.max(10, nBoloes));
  let iPool = 0;
  while (total < nBoloes) {
    const l = pool[iPool++ % pool.length]!;
    const k = Math.min(quantosBoloes(rnd), nBoloes - total);
    let t = t0 + atrasoPrimeiroBolao(rnd) * 1000;
    const chegadas = [t];
    for (let i = 1; i < k; i++) {
      t += Math.max(2_000, rnd.exponencial(40_000));
      chegadas.push(t);
    }
    lotericas.push(l);
    planos.push({ loterica: l, chegadas });
    total += k;
  }

  const boloes: BolaoVerdade[] = [];
  let seq = 0;
  for (const { loterica, chegadas } of planos) {
    chegadas.forEach((chegada, i) => {
      const [dezenas, jogos, cotas] = rnd.escolher(formatos);
      const custo = (custoJogo(modalidade, dezenas) ?? 3.5) * jogos;
      const valorCotaBase = Math.round((custo / cotas) * 100) / 100;
      const vendas: number[] = [];
      const relampago = rnd.proximo() < 0.12;
      const vendidas = relampago ? cotas : Math.round(cotas * (0.3 + 0.7 * rnd.proximo()));
      for (let c = 0; c < vendidas; c++) {
        const dt = relampago
          ? (3 + rnd.proximo() * 37) * 60_000 * rnd.proximo()
          : (fechaEm.getTime() - chegada) * rnd.proximo() ** 1.5;
        vendas.push(Math.round(chegada + Math.max(1_000, dt)));
      }
      vendas.sort((a, b) => a - b);
      seq++;
      boloes.push({
        bolao: {
          idCaixa: `SIM-${concurso}-${String(seq).padStart(5, '0')}`,
          loterica,
          modalidade,
          concurso,
          jogos,
          dezenas,
          cotasTotal: cotas,
          valorCotaBase,
          valorCotaExibido: Math.round(valorCotaBase * 1.35 * 100) / 100,
        },
        chegadaEm: new Date(Math.round(chegada)),
        fila: i + 1,
        vendas,
      });
    });
  }
  boloes.sort((a, b) => a.chegadaEm.getTime() - b.chegadaEm.getTime());
  return { modalidade, concurso, t0: o.t0, fechaEm, lotericas, boloes };
}

/** Cotas disponíveis do bolão no instante t (ms). */
export function disponiveisEm(b: BolaoVerdade, t: number): number {
  let lo = 0;
  let hi = b.vendas.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (b.vendas[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return b.bolao.cotasTotal - lo;
}

/** Instante (ms) em que o bolão esgota, ou null. */
export function esgotaEm(b: BolaoVerdade): number | null {
  return b.vendas.length === b.bolao.cotasTotal ? b.vendas[b.vendas.length - 1]! : null;
}

/** Vitrine verdadeira no instante t: visíveis (chegaram e com cotas) na ordem (fila, chegada). */
export function vitrineEm(sim: AberturaSimulada, t: Date): BolaoFonte[] {
  const ms = t.getTime();
  if (ms >= sim.fechaEm.getTime()) return [];
  return sim.boloes
    .filter((b) => b.chegadaEm.getTime() <= ms && disponiveisEm(b, ms) > 0)
    .sort((a, b) => a.fila - b.fila || a.chegadaEm.getTime() - b.chegadaEm.getTime())
    .map((b) => ({ ...b.bolao, cotasDisponiveis: disponiveisEm(b, ms) }));
}

/** Leitura instantânea e completa da vitrine (como se todas as páginas viessem no mesmo instante). */
export function leituraSimulada(sim: AberturaSimulada, t: Date): LeituraVitrine {
  const itens: ItemLeitura[] = vitrineEm(sim, t).map((b, i) => ({ ...b, posicaoObservada: i + 1, vistoEm: t }));
  return {
    modalidade: sim.modalidade,
    concurso: sim.concurso,
    iniciouEm: t,
    terminouEm: t,
    paginasLidas: Math.max(1, Math.ceil(itens.length / 30)),
    completa: true,
    ordemDaVitrine: true,
    duplicados: 0,
    itens,
  };
}

/** Horários das leituras do modo abertura: T0 − 1 min até T0 + 60 min (5 s, depois 15 s). */
export function cronogramaAbertura(t0: Date, cfg: ConfigColeta = CONFIG_COLETA_PADRAO): Date[] {
  const inicio = t0.getTime() - cfg.aberturaAntesMs;
  const fimRapido = t0.getTime() + cfg.aberturaRapidaMs;
  const fim = t0.getTime() + cfg.aberturaDuracaoMs;
  const r: Date[] = [];
  for (let t = inicio; t < fimRapido; t += cfg.intervaloRapidoMs) r.push(new Date(t));
  for (let t = fimRapido; t < fim; t += cfg.intervaloLentoMs) r.push(new Date(t));
  return r;
}
