import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarFixture, ClienteHttpEducado, FonteCaixaHttp, FonteFixture, type FonteBoloes } from '@radar/core/fonte';
import { FonteSimulada, gerarAberturaSimulada, type AberturaSimulada } from '@radar/core/simulacao';
import { ehModalidade } from '@radar/core';
import type { ConfigWorker } from './config';
import { FonteCaixaLinks } from './fontes/caixa-links';
import { FonteCaixaNavegador, type EstadoSessao } from './fontes/caixa-navegador';

/**
 * Sessão do navegador: arquivo (CAIXA_SESSAO) ou, sem arquivo, o storageState em base64 na variável
 * CAIXA_SESSAO_JSON. Nunca no repositório. A senha da conta dedicada nunca é guardada: uma pessoa
 * faz o login em `caixa:preparar-sessao` e só os cookies da sessão ficam salvos.
 */
export function sessaoDaConfig(amb: ConfigWorker['amb']): string | Record<string, unknown> {
  if (amb.CAIXA_SESSAO_JSON) return JSON.parse(Buffer.from(amb.CAIXA_SESSAO_JSON, 'base64').toString('utf8')) as Record<string, unknown>;
  return amb.CAIXA_SESSAO;
}

function criarNavegador(cfg: ConfigWorker, relogio: FonteDeTempo): FonteCaixaNavegador {
  const { amb } = cfg;
  return new FonteCaixaNavegador({
    baseUrl: amb.CAIXA_BASE_URL_NAVEGADOR,
    estadoSessao: sessaoDaConfig(amb) as EstadoSessao,
    contaDedicada: amb.CAIXA_CONTA_DEDICADA,
    headless: amb.CAIXA_HEADLESS,
    intervaloMinimoMs: amb.CAIXA_INTERVALO_MS,
    timeoutMs: amb.CAIXA_TIMEOUT_MS,
    modalidades: amb.CAIXA_MODALIDADES.split(',').map((m) => m.trim()).filter(ehModalidade),
    ...(amb.CAIXA_NAVEGADOR_EXECUTAVEL ? { executavel: amb.CAIXA_NAVEGADOR_EXECUTAVEL } : {}),
    agora: () => relogio.agora(),
  });
}
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
      return { fonte: criarNavegador(cfg, relogio), simulacoes: [] };
    case 'caixa-links': {
      const lotericas = amb.CAIXA_LOTERICAS.split(',').map((c) => c.trim()).filter((c) => /^\d+$/.test(c));
      if (!lotericas.length) throw new Error('FONTE=caixa-links exige CAIXA_LOTERICAS com os códigos das lotéricas monitoradas');
      return { fonte: new FonteCaixaLinks(criarNavegador(cfg, relogio), lotericas, () => relogio.agora()), simulacoes: [] };
    }
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
