/**
 * Espelho Drizzle do DDL em migrations/*.sql (fonte da verdade do schema).
 * snapshots_bolao é particionada por dia no SQL; para o Drizzle é uma tabela comum.
 * O teste de integração (test/schema.int.test.ts) confere se as colunas batem com o banco.
 */
import {
  bigint,
  bigserial,
  boolean,
  char,
  date,
  doublePrecision,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  smallint,
  smallserial,
  text,
  time,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { PartidaLoteca } from '@radar/core';

const tz = (nome: string) => timestamp(nome, { withTimezone: true, mode: 'date' });
const id64 = (nome: string) => bigint(nome, { mode: 'number' });

export const modalidades = pgTable('modalidades', {
  id: smallserial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nome: text('nome').notNull(),
  cor: text('cor'),
  horarioSorteio: time('horario_sorteio'),
  horarioFechamento: time('horario_fechamento'),
});

export const lotericas = pgTable('lotericas', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  codigoCaixa: text('codigo_caixa').notNull().unique(),
  nome: text('nome').notNull(),
  slug: text('slug').unique(),
  cidade: text('cidade').notNull(),
  uf: char('uf', { length: 2 }).notNull(),
  bairro: text('bairro'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  firstSeenAt: tz('first_seen_at').notNull().defaultNow(),
  atualizadoEm: tz('atualizado_em').notNull().defaultNow(),
});

export const concursos = pgTable('concursos', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  modalidadeId: smallint('modalidade_id').notNull(),
  numero: integer('numero').notNull(),
  dataSorteio: date('data_sorteio', { mode: 'string' }),
  abreEm: tz('abre_em'),
  fechaEm: tz('fecha_em'),
  premioEstimado: numeric('premio_estimado', { precision: 16, scale: 2 }),
  acumulado: boolean('acumulado'),
  especial: boolean('especial').notNull().default(false),
  encerradoEm: tz('encerrado_em'),
  origem: text('origem').notNull().default('fonte'),
  sorteioEm: tz('sorteio_em'),
  abreEmPrevisto: tz('abre_em_previsto'),
  abreEmOrigem: text('abre_em_origem', { enum: ['regra', 'fonte', 'primeiro_bolao', 'manual'] }).notNull().default('regra'),
  abreEmRegra: text('abre_em_regra'),
});

export const regrasAbertura = pgTable('regras_abertura', {
  id: serial('id').primaryKey(),
  chave: text('chave').notNull().unique(),
  modalidadeId: smallint('modalidade_id'),
  diaSemana: smallint('dia_semana'),
  minutosAposSorteio: integer('minutos_apos_sorteio'),
  horaPadrao: time('hora_padrao'),
  prioridade: integer('prioridade').notNull().default(50),
  ativo: boolean('ativo').notNull().default(true),
  observacao: text('observacao'),
});

export const boloes = pgTable('boloes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  idCaixa: text('id_caixa').notNull().unique(),
  lotericaId: id64('loterica_id').notNull(),
  concursoId: id64('concurso_id').notNull(),
  jogos: smallint('jogos').notNull(),
  dezenas: smallint('dezenas').notNull(),
  cotasTotal: integer('cotas_total').notNull(),
  valorCota: numeric('valor_cota', { precision: 12, scale: 2 }).notNull(),
  valorCotaExibido: numeric('valor_cota_exibido', { precision: 12, scale: 2 }),
  valorAposta: numeric('valor_aposta', { precision: 14, scale: 2 }).notNull(),
  cotasDisponiveis: integer('cotas_disponiveis').notNull(),
  firstSeenAt: tz('first_seen_at').notNull(),
  lastSeenAt: tz('last_seen_at').notNull(),
  fila: integer('fila').notNull(),
  filaCalculada: integer('fila_calculada').notNull(),
  filaObservada: integer('fila_observada'),
  filaObservadaEntrada: integer('fila_observada_entrada'),
  cotasDigitais: integer('cotas_digitais'),
  contemResiduo: boolean('contem_residuo').notNull().default(false),
  valorUltimaCota: numeric('valor_ultima_cota', { precision: 12, scale: 2 }),
  tarifaCota: numeric('tarifa_cota', { precision: 12, scale: 2 }),
  ordemPrimeiraLeitura: integer('ordem_primeira_leitura'),
  posEntradaBrasil: integer('pos_entrada_brasil'),
  posEntradaUf: integer('pos_entrada_uf'),
  posEntradaCidade: integer('pos_entrada_cidade'),
  posEntradaCalcBrasil: integer('pos_entrada_calc_brasil').notNull(),
  posEntradaCalcUf: integer('pos_entrada_calc_uf').notNull(),
  posEntradaCalcCidade: integer('pos_entrada_calc_cidade').notNull(),
  empateEntrada: boolean('empate_entrada').notNull().default(false),
  status: text('status', { enum: ['a_venda', 'esgotado', 'encerrado', 'estornado'] }).notNull().default('a_venda'),
  esgotouEm: tz('esgotou_em'),
  sobraFinal: integer('sobra_final'),
  estornado: boolean('estornado').notNull().default(false),
  estornadoEm: tz('estornado_em'),
});

export const bolaoJogos = pgTable(
  'bolao_jogos',
  {
    bolaoId: id64('bolao_id').notNull(),
    ordem: smallint('ordem').notNull(),
    numeros: integer('numeros').array().notNull(),
    trevos: integer('trevos').array(),
    timeCoracao: text('time_coracao'),
    mesSorte: smallint('mes_sorte'),
    /** Super Sete: dígitos por coluna (number[][]); Loteca: palpites por jogo (("1" | "X" | "2")[][]). */
    colunas: jsonb('colunas').$type<number[][] | string[][]>(),
  },
  (t) => [primaryKey({ columns: [t.bolaoId, t.ordem] })],
);

export const snapshotsBolao = pgTable(
  'snapshots_bolao',
  {
    coletadoEm: tz('coletado_em').notNull(),
    bolaoId: id64('bolao_id').notNull(),
    cotasDisponiveis: integer('cotas_disponiveis').notNull(),
    presente: boolean('presente').notNull().default(true),
    posicaoBrasil: integer('posicao_brasil'),
    posicaoUf: integer('posicao_uf'),
    posicaoCidade: integer('posicao_cidade'),
    coletaId: id64('coleta_id'),
  },
  (t) => [primaryKey({ columns: [t.bolaoId, t.coletadoEm] })],
);

export const eventosBolao = pgTable('eventos_bolao', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  bolaoId: id64('bolao_id').notNull(),
  tipo: text('tipo', { enum: ['bolao_novo', 'venda', 'devolucao', 'esgotou', 'encerrou', 'estorno'] }).notNull(),
  em: tz('em').notNull(),
  quantidade: integer('quantidade'),
  inferido: boolean('inferido').notNull().default(false),
  coletaId: id64('coleta_id'),
});

export const coletas = pgTable('coletas', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  tipo: text('tipo', { enum: ['varredura', 'contagens', 'encerrar', 'concursos', 'abertura'] }).notNull(),
  modo: text('modo', { enum: ['normal', 'abertura'] }).notNull(),
  modalidade: text('modalidade'),
  concurso: integer('concurso'),
  slot: id64('slot'),
  agendadaPara: tz('agendada_para'),
  iniciouEm: tz('iniciou_em').notNull(),
  terminouEm: tz('terminou_em'),
  itens: integer('itens'),
  paginas: integer('paginas'),
  completa: boolean('completa'),
  novos: integer('novos'),
  eventos: integer('eventos'),
  erro: text('erro'),
  desvioServidorMs: integer('desvio_servidor_ms'),
  estrategia: text('estrategia', { enum: ['completa', 'borda'] }),
});

export const mercadoMinuto = pgTable(
  'mercado_minuto',
  {
    concursoId: id64('concurso_id').notNull(),
    modalidadeId: smallint('modalidade_id').notNull(),
    uf: char('uf', { length: 2 }).notNull(),
    minuto: tz('minuto').notNull(),
    boloes: integer('boloes').notNull(),
    cotas: integer('cotas').notNull(),
    lotericas: integer('lotericas').notNull(),
    valor: numeric('valor', { precision: 16, scale: 2 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.concursoId, t.uf, t.minuto] })],
);

export const aberturas = pgTable('aberturas', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  concursoId: id64('concurso_id').notNull().unique(),
  t0: tz('t0').notNull(),
  janelaMin: smallint('janela_min').notNull().default(60),
  participacaoMin: smallint('participacao_min').notNull().default(30),
  processadaEm: tz('processada_em'),
  escopoColocacao: text('escopo_colocacao', { enum: ['vitrine', 'monitoradas'] }).notNull().default('vitrine'),
});

export const aberturaParticipacoes = pgTable(
  'abertura_participacoes',
  {
    aberturaId: id64('abertura_id').notNull(),
    lotericaId: id64('loterica_id').notNull(),
    primeiroBolaoId: id64('primeiro_bolao_id').notNull(),
    primeiroEm: tz('primeiro_em').notNull(),
    atrasoS: numeric('atraso_s', { precision: 9, scale: 3 }).notNull(),
    nBoloes1h: integer('n_boloes_1h').notNull(),
    posCidade: integer('pos_cidade').notNull(),
    posUf: integer('pos_uf').notNull(),
    posBrasil: integer('pos_brasil').notNull(),
    paginaCidade: integer('pagina_cidade').notNull(),
    paginaUf: integer('pagina_uf').notNull(),
    paginaBrasil: integer('pagina_brasil').notNull(),
    valor1h: numeric('valor_1h', { precision: 14, scale: 2 }).notNull(),
    pctVendido: numeric('pct_vendido', { precision: 6, scale: 5 }),
    sobra: numeric('sobra', { precision: 14, scale: 2 }),
    empate: boolean('empate').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.aberturaId, t.lotericaId] })],
);

export const franquiaDiaria = pgTable(
  'franquia_diaria',
  {
    lotericaId: id64('loterica_id').notNull(),
    dia: date('dia', { mode: 'string' }).notNull(),
    limite: numeric('limite', { precision: 12, scale: 2 }),
    usado: numeric('usado', { precision: 12, scale: 2 }).notNull().default('0'),
  },
  (t) => [primaryKey({ columns: [t.lotericaId, t.dia] })],
);

export const resultados = pgTable('resultados', {
  concursoId: id64('concurso_id').primaryKey(),
  dataApuracao: date('data_apuracao', { mode: 'string' }).notNull(),
  dezenas: integer('dezenas').array().notNull(),
  dezenas2: integer('dezenas2').array(),
  trevos: integer('trevos').array(),
  timeCoracao: text('time_coracao'),
  mesSorte: smallint('mes_sorte'),
  partidas: jsonb('partidas').$type<PartidaLoteca[]>(),
  acumulado: boolean('acumulado').notNull().default(false),
  origem: text('origem', { enum: ['caixa', 'seed'] }).notNull().default('caixa'),
  obtidoEm: tz('obtido_em').notNull().defaultNow(),
  bruto: jsonb('bruto'),
});

export const rateios = pgTable(
  'rateios',
  {
    concursoId: id64('concurso_id').notNull(),
    faixa: smallint('faixa').notNull(),
    descricao: text('descricao').notNull(),
    acertos: smallint('acertos'),
    ganhadores: integer('ganhadores').notNull(),
    valorPremio: numeric('valor_premio', { precision: 16, scale: 2 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.concursoId, t.faixa] })],
);

export const todasAsTabelas = {
  modalidades,
  lotericas,
  concursos,
  boloes,
  bolaoJogos,
  snapshotsBolao,
  eventosBolao,
  coletas,
  mercadoMinuto,
  aberturas,
  aberturaParticipacoes,
  franquiaDiaria,
  regrasAbertura,
  resultados,
  rateios,
};
