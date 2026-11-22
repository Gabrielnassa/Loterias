import { CONFIG_COLETA_PADRAO, type ConfigColeta } from '@radar/core';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const esquema = z.object({
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  FONTE: z.enum(['simulada', 'fixture', 'caixa', 'caixa-navegador', 'caixa-links']).default('simulada'),
  FILA: z.enum(['bullmq', 'memoria']).default('bullmq'),
  REPOSITORIO: z.enum(['postgres', 'memoria']).default('postgres'),
  MIGRAR_NA_PARTIDA: bool.default('true'),
  LOG_LEVEL: z.string().default('info'),
  NTP_SERVIDOR: z.string().default('a.ntp.br'),
  NTP_INTERVALO_MIN: z.coerce.number().positive().default(10),
  AGENDADOR_TICK_MS: z.coerce.number().int().positive().default(250),
  COLETA_CONCORRENCIA: z.coerce.number().int().positive().default(4),
  COLETA_INTERVALO_RAPIDO_MS: z.coerce.number().int().positive().default(CONFIG_COLETA_PADRAO.intervaloRapidoMs),
  COLETA_INTERVALO_LENTO_MS: z.coerce.number().int().positive().default(CONFIG_COLETA_PADRAO.intervaloLentoMs),
  COLETA_ABERTURA_RAPIDA_MIN: z.coerce.number().positive().default(30),
  COLETA_ABERTURA_DURACAO_MIN: z.coerce.number().positive().default(60),
  COLETA_ABERTURA_ANTES_S: z.coerce.number().nonnegative().default(60),
  COLETA_VARREDURA_NORMAL_MIN: z.coerce.number().positive().default(5),
  COLETA_CONTAGENS_S: z.coerce.number().positive().default(60),
  COLETA_MAX_PAGINAS_ABERTURA: z.coerce.number().int().positive().default(200),
  COLETA_MAX_PAGINAS_NORMAL: z.coerce.number().int().positive().default(4000),
  COLETA_KEYFRAME_MIN: z.coerce.number().positive().default(10),
  COLETA_LEITURAS_PARA_SUMICO: z.coerce.number().int().positive().default(2),
  COLETA_PAUSA_BLOQUEIO_MIN: z.coerce.number().positive().default(30),
  COLETA_PARTICIPACAO_MIN: z.coerce.number().positive().default(30),
  COLETA_PAUSA_ACAO_HUMANA_MIN: z.coerce.number().positive().default(10),
  COLETA_COMPLETA_A_CADA_S: z.coerce.number().positive().default(60),
  /** Buscar o resultado oficial na API pública da CAIXA (Conferência). Padrão: só com fonte real. */
  RESULTADOS_CAIXA: bool.optional(),
  /** Fase 6: gera os alertas (monitoradas, vendas, resultados, prêmios, resumo semanal) e manda Web Push (VAPID_*). Só com Postgres. */
  ALERTAS: bool.default('true'),
  FONTE_INTERVALO_MIN_MS: z.coerce.number().int().nonnegative().default(250),
  FONTE_FIXTURES_DIR: z.string().optional(),
  CAIXA_BASE_URL: z.string().optional(),
  // adaptador caixa-navegador (Playwright)
  CAIXA_BASE_URL_NAVEGADOR: z.string().default('https://www.loteriasonline.caixa.gov.br/silce-web/'),
  CAIXA_SESSAO: z.string().default('.sessao-caixa/estado.json'),
  /** Alternativa ao arquivo: o storageState em base64 numa variável de ambiente (nunca no repositório). */
  CAIXA_SESSAO_JSON: z.string().optional(),
  /** true = a sessão é de uma conta DEDICADA logada (voltar para a home = sessão expirada). */
  CAIXA_CONTA_DEDICADA: bool.default('false'),
  /** Modo caixa-links: códigos das lotéricas monitoradas, separados por vírgula. */
  CAIXA_LOTERICAS: z.string().default(''),
  /** Até onde a varredura segue na vitrine: cidade (padrão), estado (resto da UF) ou brasil. */
  CAIXA_ESCOPOS: z.enum(['cidade', 'estado', 'brasil']).default('cidade'),
  /** Regra de ordem DENTRO da fila para a colocação calculada (hipótese a validar). */
  VITRINE_ORDEM: z.enum(['fila-chegada', 'fila-aleatoria']).default('fila-chegada'),
  CAIXA_HEADLESS: bool.default('true'),
  CAIXA_INTERVALO_MS: z.coerce.number().int().positive().default(3000),
  CAIXA_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  CAIXA_MODALIDADES: z.string().default('mega-sena,lotofacil,quina'),
  CAIXA_NAVEGADOR_EXECUTAVEL: z.string().optional(),
  SIMULACAO_T0: z.string().optional(),
  SIMULACAO_BOLOES: z.coerce.number().int().positive().default(200),
  SIMULACAO_SEMENTE: z.coerce.number().int().default(20261116),
});

export type Ambiente = z.infer<typeof esquema>;

export interface ConfigWorker {
  amb: Ambiente;
  coleta: ConfigColeta;
  coletor: ConfigColetor;
}

export interface ConfigColetor {
  maxPaginas: { abertura: number; normal: number };
  keyframeMs: number;
  leiturasParaSumico: number;
  /** Regra de ordem dentro da fila (colocação calculada): hipótese a validar com uma abertura real. */
  regraOrdem?: 'fila-chegada' | 'fila-aleatoria';
  pausaBloqueioMs: number;
  /** Janela da abertura e limite de participação (minutos após T0). */
  janelaMin: number;
  participacaoMin: number;
  /** Pausa quando o portal pede uma pessoa (idade, login, sessão expirada). */
  pausaAcaoHumanaMs: number;
  /** Intervalo de leitura no início da abertura (decide entre leitura completa e borda da 1ª fila). */
  intervaloAberturaMs: number;
  /** Leitura completa forçada a cada X ms no modo borda. */
  completaACadaMs: number;
}

export const CONFIG_COLETOR_PADRAO: ConfigColetor = {
  maxPaginas: { abertura: 200, normal: 4000 },
  keyframeMs: 10 * 60_000,
  leiturasParaSumico: 2,
  pausaBloqueioMs: 30 * 60_000,
  janelaMin: 60,
  participacaoMin: 30,
  pausaAcaoHumanaMs: 10 * 60_000,
  intervaloAberturaMs: 5_000,
  completaACadaMs: 60_000,
};

export function lerConfig(env: NodeJS.ProcessEnv = process.env): ConfigWorker {
  const amb = esquema.parse(env);
  if (amb.REPOSITORIO === 'postgres' && !amb.DATABASE_URL) throw new Error('DATABASE_URL é obrigatório com REPOSITORIO=postgres');
  if (amb.FILA === 'bullmq' && !amb.REDIS_URL) throw new Error('REDIS_URL é obrigatório com FILA=bullmq');
  return {
    amb,
    coleta: {
      contagensMs: amb.COLETA_CONTAGENS_S * 1000,
      varreduraNormalMs: amb.COLETA_VARREDURA_NORMAL_MIN * 60_000,
      aberturaAntesMs: amb.COLETA_ABERTURA_ANTES_S * 1000,
      aberturaDuracaoMs: amb.COLETA_ABERTURA_DURACAO_MIN * 60_000,
      aberturaRapidaMs: amb.COLETA_ABERTURA_RAPIDA_MIN * 60_000,
      intervaloRapidoMs: amb.COLETA_INTERVALO_RAPIDO_MS,
      intervaloLentoMs: amb.COLETA_INTERVALO_LENTO_MS,
    },
    coletor: {
      maxPaginas: { abertura: amb.COLETA_MAX_PAGINAS_ABERTURA, normal: amb.COLETA_MAX_PAGINAS_NORMAL },
      keyframeMs: amb.COLETA_KEYFRAME_MIN * 60_000,
      leiturasParaSumico: amb.COLETA_LEITURAS_PARA_SUMICO,
      regraOrdem: amb.VITRINE_ORDEM,
      pausaBloqueioMs: amb.COLETA_PAUSA_BLOQUEIO_MIN * 60_000,
      janelaMin: amb.COLETA_ABERTURA_DURACAO_MIN,
      participacaoMin: amb.COLETA_PARTICIPACAO_MIN,
      pausaAcaoHumanaMs: amb.COLETA_PAUSA_ACAO_HUMANA_MIN * 60_000,
      intervaloAberturaMs: amb.COLETA_INTERVALO_RAPIDO_MS,
      completaACadaMs: amb.COLETA_COMPLETA_A_CADA_S * 1000,
    },
  };
}
