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
  uuid,
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

export const sites = pgTable('sites', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  lotericaId: id64('loterica_id').notNull().unique(),
  slug: text('slug').notNull().unique(),
  whatsapp: text('whatsapp'),
  instagram: text('instagram'),
  endereco: text('endereco'),
  horario: text('horario'),
  sobre: text('sobre'),
  tema: text('tema', { enum: ['classico', 'noite', 'sorte'] }).notNull().default('classico'),
  linkCaixa: text('link_caixa'),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: tz('criado_em').notNull().defaultNow(),
  atualizadoEm: tz('atualizado_em').notNull().defaultNow(),
});

export const siteEventos = pgTable('site_eventos', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  siteId: id64('site_id').notNull(),
  em: tz('em').notNull().defaultNow(),
  tipo: text('tipo', { enum: ['visita', 'whatsapp', 'caixa', 'carrinho'] }).notNull(),
  visitante: text('visitante').notNull(),
  bolaoId: text('bolao_id'),
});

// Fase 6: contas, equipe e login (0007_contas.sql)
export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  nome: text('nome').notNull(),
  senhaHash: text('senha_hash'),
  emailVerificadoEm: tz('email_verificado_em'),
  criadoEm: tz('criado_em').notNull().defaultNow(),
});

export const contas = pgTable('contas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  criadoEm: tz('criado_em').notNull().defaultNow(),
});

export const contaLojas = pgTable(
  'conta_lojas',
  {
    contaId: uuid('conta_id').notNull(),
    lotericaCodigo: text('loterica_codigo').notNull(),
    nome: text('nome').notNull(),
    franquiaLimite: numeric('franquia_limite', { precision: 12, scale: 2, mode: 'number' }).notNull().default(8000),
    verificadaEm: tz('verificada_em'),
    criadoEm: tz('criado_em').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contaId, t.lotericaCodigo] })],
);

export const membros = pgTable(
  'membros',
  {
    contaId: uuid('conta_id').notNull(),
    usuarioId: uuid('usuario_id').notNull(),
    papel: text('papel', { enum: ['responsavel', 'socio', 'colaborador'] }).notNull(),
    telas: text('telas').array(),
    lojas: text('lojas').array(),
    criadoEm: tz('criado_em').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contaId, t.usuarioId] })],
);

export const convites = pgTable('convites', {
  id: uuid('id').primaryKey().defaultRandom(),
  contaId: uuid('conta_id').notNull(),
  email: text('email').notNull(),
  papel: text('papel', { enum: ['socio', 'colaborador'] }).notNull(),
  telas: text('telas').array(),
  lojas: text('lojas').array(),
  tokenHash: text('token_hash').notNull().unique(),
  criadoPor: uuid('criado_por'),
  criadoEm: tz('criado_em').notNull().defaultNow(),
  expiraEm: tz('expira_em').notNull(),
  aceitoEm: tz('aceito_em'),
  canceladoEm: tz('cancelado_em'),
});

export const tokensLogin = pgTable('tokens_login', {
  tokenHash: text('token_hash').primaryKey(),
  email: text('email').notNull(),
  voltar: text('voltar'),
  criadoEm: tz('criado_em').notNull().defaultNow(),
  expiraEm: tz('expira_em').notNull(),
  usadoEm: tz('usado_em'),
});

export const sessoes = pgTable('sessoes', {
  tokenHash: text('token_hash').primaryKey(),
  usuarioId: uuid('usuario_id').notNull(),
  contaId: uuid('conta_id'),
  criadoEm: tz('criado_em').notNull().defaultNow(),
  expiraEm: tz('expira_em').notNull(),
  vistoEm: tz('visto_em').notNull().defaultNow(),
  aparelho: text('aparelho'),
});

// Fase 6: monitoradas, aparelhos (Web Push) e notificações (0008_avisos.sql)
export const monitoradas = pgTable(
  'monitoradas',
  {
    contaId: uuid('conta_id').notNull(),
    lotericaCodigo: text('loterica_codigo').notNull(),
    apelido: text('apelido'),
    criadoEm: tz('criado_em').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contaId, t.lotericaCodigo] })],
);

export const aparelhos = pgTable('aparelhos', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id').notNull(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  nome: text('nome'),
  preferencias: jsonb('preferencias').notNull().default({}),
  criadoEm: tz('criado_em').notNull().defaultNow(),
  vistoEm: tz('visto_em').notNull().defaultNow(),
  falhas: integer('falhas').notNull().default(0),
  desativadoEm: tz('desativado_em'),
});

export const notificacoes = pgTable('notificacoes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  usuarioId: uuid('usuario_id').notNull(),
  contaId: uuid('conta_id'),
  categoria: text('categoria').notNull(),
  titulo: text('titulo').notNull(),
  corpo: text('corpo').notNull(),
  url: text('url'),
  chave: text('chave').notNull(),
  criadoEm: tz('criado_em').notNull().defaultNow(),
  lidaEm: tz('lida_em'),
  enviadas: integer('enviadas').notNull().default(0),
});

// Fase 6: planos e cobrança (0009_planos.sql)
export const assinaturas = pgTable('assinaturas', {
  contaId: uuid('conta_id').primaryKey(),
  plano: text('plano', { enum: ['gratis', 'pro', 'pro-mais', 'gestao'] }).notNull(),
  status: text('status', { enum: ['teste', 'ativa', 'atrasada', 'cancelada', 'cortesia'] }).notNull(),
  testeAte: tz('teste_ate'),
  pagoAte: tz('pago_ate'),
  forma: text('forma', { enum: ['PIX', 'CREDIT_CARD'] }),
  valor: numeric('valor', { precision: 10, scale: 2, mode: 'number' }),
  asaasClienteId: text('asaas_cliente_id'),
  asaasAssinaturaId: text('asaas_assinatura_id').unique(),
  canceladaEm: tz('cancelada_em'),
  criadoEm: tz('criado_em').notNull().defaultNow(),
  atualizadoEm: tz('atualizado_em').notNull().defaultNow(),
});

export const cobrancas = pgTable('cobrancas', {
  id: text('id').primaryKey(),
  contaId: uuid('conta_id').notNull(),
  asaasAssinaturaId: text('asaas_assinatura_id'),
  valor: numeric('valor', { precision: 10, scale: 2, mode: 'number' }).notNull(),
  vencimento: date('vencimento', { mode: 'string' }).notNull(),
  status: text('status').notNull(),
  forma: text('forma'),
  link: text('link'),
  pagoEm: tz('pago_em'),
  atualizadoEm: tz('atualizado_em').notNull().defaultNow(),
});

export const webhooksAsaas = pgTable('webhooks_asaas', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chave: text('chave').notNull().unique(),
  evento: text('evento').notNull(),
  recebidoEm: tz('recebido_em').notNull().defaultNow(),
  corpo: jsonb('corpo').notNull(),
  processadoEm: tz('processado_em'),
  erro: text('erro'),
});

// Fase 6: gestão da loja física (0010_gestao.sql)
export const gestaoRegistros = pgTable('gestao_registros', {
  id: uuid('id').primaryKey().defaultRandom(),
  contaId: uuid('conta_id').notNull(),
  lojaCodigo: text('loja_codigo').notNull(),
  tipo: text('tipo', { enum: ['caixa', 'fechamento', 'carro-forte', 'lancamento', 'despesa-fixa', 'fiado'] }).notNull(),
  dia: date('dia', { mode: 'string' }),
  chave: text('chave'),
  dados: jsonb('dados').notNull(),
  criadoPor: uuid('criado_por'),
  criadoEm: tz('criado_em').notNull().defaultNow(),
  atualizadoEm: tz('atualizado_em').notNull().defaultNow(),
});

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
  sites,
  siteEventos,
  usuarios,
  contas,
  contaLojas,
  membros,
  convites,
  tokensLogin,
  sessoes,
  monitoradas,
  aparelhos,
  notificacoes,
  assinaturas,
  cobrancas,
  webhooksAsaas,
  gestaoRegistros,
};
