import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarFixture, ClienteHttpEducado, FonteCaixaHttp, FonteFixture, type FonteBoloes } from '@radar/core/fonte';
import { FonteSimulada, gerarAberturaSimulada, type AberturaSimulada } from '@radar/core/simulacao';
import { ehModalidade } from '@radar/core';
import type { ConfigWorker } from './config';
import { FonteCaixaNavegador } from './fontes/caixa-navegador';
import type { FonteDeTempo } from './relogio';

const FIXTURES_PADRAO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'packages', 'core', 'fonte', 'fixtures');

export interface FonteCriada {
  fonte: FonteBoloes;
  /** Aberturas simuladas (só com FONTE=simulada), para cadastrar o T0 no repositório. */
  simulacoes: AberturaSimulada[];
}

export function carregarFixturesDoDiretorio(dir: string) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('pagina-'))
    .map((f) => carregarFixture(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
}

export function criarFonte(cfg: ConfigWorker, relogio: FonteDeTempo): FonteCriada {
  const { amb } = cfg;
  switch (amb.FONTE) {
    case 'fixture':
      return { fonte: new FonteFixture(carregarFixturesDoDiretorio(amb.FONTE_FIXTURES_DIR ?? FIXTURES_PADRAO), () => relogio.agora()), simulacoes: [] };
    case 'simulada': {
      const t0 = amb.SIMULACAO_T0 ? new Date(amb.SIMULACAO_T0) : new Date(Math.ceil((relogio.agora().getTime() + 90_000) / 5000) * 5000);
      const sim = gerarAberturaSimulada({ semente: amb.SIMULACAO_SEMENTE, t0, nBoloes: amb.SIMULACAO_BOLOES, modalidade: 'lotofacil', concurso: 3880 });
      return { fonte: new FonteSimulada([sim], () => relogio.agora()), simulacoes: [sim] };
    }
    case 'caixa-navegador':
      return {
        fonte: new FonteCaixaNavegador({
          baseUrl: amb.CAIXA_BASE_URL_NAVEGADOR,
          estadoSessao: amb.CAIXA_SESSAO,
          headless: amb.CAIXA_HEADLESS,
          intervaloMinimoMs: amb.CAIXA_INTERVALO_MS,
          timeoutMs: amb.CAIXA_TIMEOUT_MS,
          modalidades: amb.CAIXA_MODALIDADES.split(',').map((m) => m.trim()).filter(ehModalidade),
          ...(amb.CAIXA_NAVEGADOR_EXECUTAVEL ? { executavel: amb.CAIXA_NAVEGADOR_EXECUTAVEL } : {}),
          agora: () => relogio.agora(),
        }),
        simulacoes: [],
      };
    case 'caixa':
      return {
        fonte: new FonteCaixaHttp(
          { ...(amb.CAIXA_BASE_URL ? { baseUrl: amb.CAIXA_BASE_URL } : {}) },
          new ClienteHttpEducado({ intervaloMinimoMs: amb.FONTE_INTERVALO_MIN_MS }),
        ),
        simulacoes: [],
      };
  }
}
