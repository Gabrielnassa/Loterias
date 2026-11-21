import { calcularParticipacoes, type Participacao } from '../abertura/participacao';
import type { ModalidadeSlug } from '../dominio/modalidades';
import type { LotericaRef } from '../dominio/tipos';
import type { AberturaInfo, ParticipacaoInfo } from '../raio-x/semanal';
import { diaSP, isodowDoDia, semanaSP, somarDias, t0Padrao } from '../tempo/fuso';
import { criarAleatorio, type Aleatorio } from '../util/aleatorio';
import { CIDADES, cronogramaAbertura, gerarAberturaSimulada } from './abertura-simulada';
import { coletarSimulacao, type BolaoColetadoSimulado } from './coleta-rapida';

/**
 * Histórico SIMULADO de aberturas (várias semanas) com lotéricas FIXAS e perfis estáveis, para
 * a web funcionar antes do coletor real ter histórico. Cada abertura passa pelas mesmas regras do
 * coletor (coletarSimulacao + calcularParticipacoes). Lotéricas e códigos são fictícios.
 *
 * Calendário simulado (não é o oficial): Lotofácil e Quina de segunda a sábado às 21:45, Mega-Sena
 * terça, quinta e sábado às 21:45, Lotofácil no domingo às 11:45.
 */
export type Velocidade = 'relampago' | 'rapida' | 'media' | 'lenta';

export interface PerfilLoterica {
  loterica: LotericaRef;
  velocidade: Velocidade;
  /** Chance de abrir em cada dia ISO (índice 1..7; 0 não usado). */
  chancePorDia: number[];
  modalidades: ModalidadeSlug[];
  boloesMedio: number;
  /** Variação da chance por semana (tendência): +0,05 = 5 pontos a mais por semana. */
  tendenciaSemanal: number;
}

export interface PlanoAbertura extends AberturaInfo {
  concurso: number;
  semente: number;
  participantes: { loterica: LotericaRef; atrasoPrimeiroS: number; nBoloes: number }[];
}

export interface HistoricoSimulado {
  lotericas: LotericaRef[];
  perfis: PerfilLoterica[];
  aberturas: PlanoAbertura[];
  participacoes: (ParticipacaoInfo & { loterica: LotericaRef })[];
  /** Todos os bolões da abertura na janela (tela 2), regenerados de forma determinística. */
  detalhar(aberturaId: string): BolaoColetadoSimulado[] | null;
}

const NOMES_A = ['Trevo', 'Sorte', 'Estrela', 'Fortuna', 'Ponto', 'Casa', 'Canto', 'Recanto', 'Mundo', 'Rota', 'Vila', 'Porto'];
const NOMES_B = ['de Ouro', 'Grande', 'Feliz', 'da Sorte', 'Premiada', 'Certa', 'Nova', 'Central', 'do Bairro', 'Real', 'Azul', 'Dourada'];

function gerarPerfis(rnd: Aleatorio, n: number): PerfilLoterica[] {
  const perfis: PerfilLoterica[] = [];
  const usados = new Set<string>();
  for (let i = 0; i < n; i++) {
    // a 1ª lotérica é a "sua" na demonstração: São Paulo, rápida e frequente
    const [cidade, uf, , bairros] = i === 0 ? CIDADES[0]! : rnd.ponderado(CIDADES.map((c) => [c, c[2]] as const));
    let nome = '';
    for (let k = 0; k < 50; k++) {
      nome = i === 0 ? 'Lotérica Trevo de Ouro' : `Lotérica ${rnd.escolher(NOMES_A)} ${rnd.escolher(NOMES_B)}`;
      if (!usados.has(`${nome}|${cidade}`)) break;
    }
    usados.add(`${nome}|${cidade}`);
    const velocidade: Velocidade = i === 0 ? 'rapida' : rnd.ponderado([['relampago', 12], ['rapida', 28], ['media', 35], ['lenta', 25]] as const);
    const base = i === 0 ? 0.85 : rnd.ponderado([[0.9, 15], [0.65, 30], [0.4, 30], [0.15, 25]] as const);
    const chancePorDia = [0, ...Array.from({ length: 7 }, (_, d) => Math.min(1, Math.max(0, base + (rnd.proximo() - 0.5) * 0.4 - (d === 6 ? 0.2 : 0))))];
    const modalidades: ModalidadeSlug[] = rnd.ponderado([
      [['lotofacil', 'quina', 'mega-sena'], 45],
      [['lotofacil', 'mega-sena'], 25],
      [['lotofacil'], 20],
      [['mega-sena'], 10],
    ] as const).slice() as ModalidadeSlug[];
    perfis.push({
      loterica: {
        codigoCaixa: String(980000 + i * 37 + 11),
        nome,
        cidade,
        uf,
        bairro: rnd.escolher(bairros),
      },
      velocidade,
      chancePorDia,
      modalidades: i === 0 ? ['lotofacil', 'quina', 'mega-sena'] : modalidades,
      boloesMedio: 1 + rnd.inteiro(0, 4),
      tendenciaSemanal: rnd.proximo() < 0.12 ? (rnd.proximo() < 0.5 ? -0.04 : 0.04) : 0,
    });
  }
  return perfis;
}

function atrasoPorVelocidade(rnd: Aleatorio, v: Velocidade): number {
  switch (v) {
    case 'relampago':
      return 0.3 + rnd.proximo() * 6;
    case 'rapida':
      return 4 + rnd.exponencial(25);
    case 'media':
      return 45 + rnd.exponencial(200);
    case 'lenta':
      return 240 + rnd.exponencial(900);
  }
}

function calendarioDoDia(dia: string): ModalidadeSlug[] {
  const d = isodowDoDia(dia);
  if (d === 7) return ['lotofacil'];
  return d === 2 || d === 4 || d === 6 ? ['lotofacil', 'quina', 'mega-sena'] : ['lotofacil', 'quina'];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function gerarHistoricoSimulado(o: { ate: Date; semente?: number; semanas?: number; nLotericas?: number }): HistoricoSimulado {
  const semente = o.semente ?? 2026;
  const semanas = o.semanas ?? 13;
  const rnd = criarAleatorio(semente);
  const perfis = gerarPerfis(rnd, o.nLotericas ?? 800);
  const inicio = somarDias(semanaSP(o.ate), -7 * (semanas - 1));
  const numeros: Record<string, number> = { lotofacil: 3700, quina: 6800, 'mega-sena': 3040 };
  const aberturas: PlanoAbertura[] = [];
  const participacoes: HistoricoSimulado['participacoes'] = [];

  for (let i = 0; ; i++) {
    const dia = somarDias(inicio, i);
    const t0Dia = t0Padrao(dia);
    if (t0Dia.getTime() > o.ate.getTime()) break;
    const semanaIdx = Math.floor(i / 7);
    for (const modalidade of calendarioDoDia(dia)) {
      const concurso = ++numeros[modalidade]!;
      const id = `${modalidade}-${concurso}`;
      const r = criarAleatorio(hash(`${semente}|${id}`));
      const participantes: PlanoAbertura['participantes'] = [];
      for (const p of perfis) {
        if (!p.modalidades.includes(modalidade)) continue;
        const chance = Math.min(1, Math.max(0, p.chancePorDia[isodowDoDia(dia)]! + p.tendenciaSemanal * (semanaIdx - semanas / 2)));
        if (r.proximo() >= chance) continue;
        participantes.push({
          loterica: p.loterica,
          atrasoPrimeiroS: atrasoPorVelocidade(r, p.velocidade),
          nBoloes: Math.max(1, Math.round(p.boloesMedio * (0.5 + r.proximo()))),
        });
      }
      const plano: PlanoAbertura = { id, modalidade, concurso, t0: t0Dia, semente: hash(`bolões|${id}`), participantes };
      // só entra no histórico a abertura cuja janela já terminou
      if (t0Dia.getTime() + 60 * 60_000 > o.ate.getTime()) continue;
      aberturas.push(plano);
    }
  }

  const executar = (plano: PlanoAbertura) => {
    const sim = gerarAberturaSimulada({
      semente: plano.semente,
      t0: plano.t0,
      modalidade: plano.modalidade,
      concurso: plano.concurso,
      participantes: plano.participantes,
    });
    return coletarSimulacao(sim, { leituras: cronogramaAbertura(plano.t0), ate: o.ate });
  };

  for (const plano of aberturas) {
    const parts: Participacao[] = calcularParticipacoes({ t0: plano.t0 }, executar(plano));
    for (const p of parts) {
      participacoes.push({
        aberturaId: plano.id,
        lotericaCodigo: p.loterica.codigoCaixa,
        loterica: p.loterica,
        primeiroEm: p.primeiroEm,
        atrasoS: p.atrasoS,
        posCidade: p.posCidade,
        posUf: p.posUf,
        posBrasil: p.posBrasil,
        nBoloes1h: p.nBoloes1h,
        valor1h: p.valor1h,
        pctVendido: p.sobra === null ? null : p.pctVendido,
        sobra: p.sobra,
        empate: p.empate,
      });
    }
  }

  const porId = new Map(aberturas.map((a) => [a.id, a]));
  return {
    lotericas: perfis.map((p) => p.loterica),
    perfis,
    aberturas,
    participacoes,
    detalhar: (id) => {
      const plano = porId.get(id);
      return plano ? executar(plano) : null;
    },
  };
}

/**
 * Abertura "ao vivo" simulada: começa a cada 20 minutos (T0 = início do ciclo), para a tela 5
 * mostrar a ordem de chegada mudando a cada 5 s. Usa as mesmas lotéricas do histórico.
 */
export function aberturaAoVivoSimulada(h: HistoricoSimulado, agora: Date, cicloMin = 20) {
  const ciclo = cicloMin * 60_000;
  const t0 = new Date(Math.floor(agora.getTime() / ciclo) * ciclo);
  const id = `ao-vivo-${t0.getTime()}`;
  const r = criarAleatorio(hash(id));
  const dia = diaSP(t0);
  const participantes: PlanoAbertura['participantes'] = [];
  for (const p of h.perfis) {
    if (r.proximo() >= (p.chancePorDia[isodowDoDia(dia)] ?? 0.5)) continue;
    participantes.push({ loterica: p.loterica, atrasoPrimeiroS: atrasoPorVelocidade(r, p.velocidade) / 3, nBoloes: Math.max(1, p.boloesMedio) });
  }
  const sim = gerarAberturaSimulada({ semente: hash(`b|${id}`), t0, modalidade: 'lotofacil', concurso: 9000 + (t0.getTime() / ciclo) % 1000, participantes });
  const leituras = cronogramaAbertura(t0).filter((l) => l.getTime() <= agora.getTime());
  const boloes = coletarSimulacao(sim, { leituras, ate: agora });
  return {
    t0,
    modalidade: 'lotofacil' as ModalidadeSlug,
    ultimaLeitura: leituras.at(-1) ?? null,
    participacoes: calcularParticipacoes({ t0 }, boloes),
  };
}
