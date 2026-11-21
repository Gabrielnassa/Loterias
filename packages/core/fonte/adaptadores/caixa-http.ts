import { ClienteHttpEducado } from '../cliente-http';
import { FonteNaoMapeadaError } from '../erros';
import type { ConcursoAbertoFonte, ConsultaBoloes, ContagemFonte, FonteBoloes, PaginaBoloes } from '../tipos';

/**
 * Adaptador do Marketplace de Bolões da CAIXA (Loterias Online / app Loterias CAIXA).
 *
 * ESTADO: esqueleto. Os endpoints, parâmetros e campos ainda NÃO foram mapeados porque a rede
 * do ambiente de desenvolvimento bloqueou o portal (ver docs/fonte-caixa.md). Nada aqui inventa
 * URL ou formato: quando a Fase 0 for concluída (HAR ou acesso direto), implementar:
 *   1. `concursosAbertos`, `contagens` e `pagina` chamando `this.http.obter(...)`.
 *   2. `normalizarBolao(bruto)` mapeando o JSON/HTML bruto para `BolaoFonte`.
 *   3. Teste de contrato com respostas reais anonimizadas em fonte/fixtures/caixa/.
 * Regras de uso responsável: só o necessário, limite de requisições, backoff, sem burlar
 * bloqueio (o ClienteHttpEducado já para em 401/403/captcha).
 */
export interface ConfigFonteCaixa {
  /** URL base descoberta na Fase 0. */
  baseUrl?: string;
}

const PENDENTE =
  'Adaptador da CAIXA ainda não mapeado (Fase 0 pendente). Use FONTE=fixture ou FONTE=simulada; ver docs/fonte-caixa.md.';

export class FonteCaixaHttp implements FonteBoloes {
  readonly nome = 'caixa-http';

  constructor(
    readonly config: ConfigFonteCaixa = {},
    readonly http: ClienteHttpEducado = new ClienteHttpEducado(),
  ) {}

  async concursosAbertos(): Promise<ConcursoAbertoFonte[]> {
    throw new FonteNaoMapeadaError(PENDENTE);
  }

  async contagens(): Promise<ContagemFonte[]> {
    throw new FonteNaoMapeadaError(PENDENTE);
  }

  async pagina(_consulta: ConsultaBoloes): Promise<PaginaBoloes> {
    throw new FonteNaoMapeadaError(PENDENTE);
  }
}
