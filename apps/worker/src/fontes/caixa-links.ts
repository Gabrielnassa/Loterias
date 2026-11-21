import {
  concursosNaRespostaCaixa,
  normalizarPaginaCaixa,
  type ConcursoAbertoFonte,
  type ConsultaBoloes,
  type ContagemFonte,
  type FonteBoloes,
  type PaginaBoloes,
} from '@radar/core';
import type { FonteCaixaNavegador } from './caixa-navegador';

/**
 * Modo SEM CONTA: lê só os links públicos (`#/bolao-caixa/{código}`, sem login) das lotéricas
 * monitoradas. Dá a fila (`index`) e a hora de entrada de cada bolão delas, mas NÃO a colocação na
 * vitrine (escopoColocacao = 'monitoradas'): a web marca a colocação como indisponível.
 * Custo: uma carga de página por lotérica e por rodada (mais "Seguinte" se ela tiver mais de 30
 * bolões); use poucas lotéricas e intervalos maiores.
 */
export class FonteCaixaLinks implements FonteBoloes {
  readonly nome = 'caixa-links';
  readonly escopoColocacao = 'monitoradas' as const;

  constructor(
    private readonly navegador: FonteCaixaNavegador,
    private readonly lotericas: readonly string[],
    private readonly agora: () => Date = () => new Date(),
  ) {}

  async pagina(consulta: ConsultaBoloes): Promise<PaginaBoloes> {
    const itens: PaginaBoloes['itens'] = [];
    let obtidaEm = this.agora();
    if (consulta.pagina === 1) {
      for (const codigo of this.lotericas) {
        const { jsons } = await this.navegador.paginasBrutasDaLoterica(codigo);
        for (const json of jsons) itens.push(...normalizarPaginaCaixa(json, consulta, { obtidaEm }).itens);
      }
    }
    // uma "página" só, com todos os bolões das monitoradas (tamanho > itens: a varredura termina aqui)
    return { consulta, pagina: consulta.pagina, tamanhoPagina: itens.length + 1, totalPaginas: 1, itens, ordemDaVitrine: false, obtidaEm };
  }

  async concursosAbertos(): Promise<ConcursoAbertoFonte[]> {
    const vistos = new Map<string, ConcursoAbertoFonte>();
    for (const codigo of this.lotericas) {
      const { jsons } = await this.navegador.paginasBrutasDaLoterica(codigo);
      for (const json of jsons) for (const c of concursosNaRespostaCaixa(json)) vistos.set(`${c.modalidade}#${c.concurso}`, c);
    }
    return [...vistos.values()];
  }

  /** Sem a lista geral não há contagem de mercado. */
  async contagens(): Promise<ContagemFonte[]> {
    return [];
  }

  async fechar(): Promise<void> {
    await this.navegador.fechar();
  }
}
