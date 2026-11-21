import { CONFIG_COLETA_PADRAO, type ConfigColeta } from '@radar/core';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const esquema = z.object({
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  FONTE: z.enum(['simulada', 'fixture', 'caixa']).default('simulada'),
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
  COLETA_ABERTURA_RAPIDA_MIN: z.coerce.number().positive().default(15),
  COLETA_ABERTURA_DURACAO_MIN: z.coerce.number().positive().default(60),
  COLETA_ABERTURA_ANTES_S: z.coerce.number().nonnegative().default(60),
  COLETA_VARREDURA_NORMAL_MIN: z.coerce.number().positive().default(5),
  COLETA_CONTAGENS_S: z.coerce.number().positive().default(60),
  COLETA_MAX_PAGINAS_ABERTURA: z.coerce.number().int().positive().default(200),
  COLETA_MAX_PAGINAS_NORMAL: z.coerce.number().int().positive().default(4000),
  COLETA_KEYFRAME_MIN: z.coerce.number().positive().default(10),
  COLETA_LEITURAS_PARA_SUMICO: z.coerce.number().int().positive().default(2),
  COLETA_PAUSA_BLOQUEIO_MIN: z.coerce.number().positive().default(30),
  FONTE_INTERVALO_MIN_MS: z.coerce.number().int().nonnegative().default(250),
  FONTE_FIXTURES_DIR: z.string().optional(),
  CAIXA_BASE_URL: z.string().optional(),
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
  pausaBloqueioMs: number;
}

export const CONFIG_COLETOR_PADRAO: ConfigColetor = {
  maxPaginas: { abertura: 200, normal: 4000 },
  keyframeMs: 10 * 60_000,
  leiturasParaSumico: 2,
  pausaBloqueioMs: 30 * 60_000,
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
      pausaBloqueioMs: amb.COLETA_PAUSA_BLOQUEIO_MIN * 60_000,
    },
  };
}
