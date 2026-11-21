/** Erros tipados do adaptador da fonte. O coletor decide a reação pelo tipo. */

export class ErroFonte extends Error {
  constructor(mensagem: string, options?: { cause?: unknown }) {
    super(mensagem, options);
    this.name = new.target.name;
  }
}

/** Falha transitória (rede, 5xx, timeout). Pode tentar de novo com backoff. */
export class FonteIndisponivelError extends ErroFonte {}

/** A fonte mudou de formato (falha no contrato). Alerta imediato; não adianta repetir. */
export class FormatoInesperadoError extends ErroFonte {
  constructor(mensagem: string, readonly detalhes?: unknown) {
    super(mensagem);
  }
}

/**
 * A fonte recusou o acesso (401/403, captcha, desafio anti-robô). NÃO tentar burlar:
 * para de coletar e alerta um humano.
 */
export class BloqueadoPelaFonteError extends ErroFonte {
  constructor(mensagem: string, readonly status?: number) {
    super(mensagem);
  }
}

/** Limite de requisições atingido (429). Respeitar Retry-After. */
export class LimiteDeRequisicoesError extends ErroFonte {
  constructor(mensagem: string, readonly esperarMs?: number) {
    super(mensagem);
  }
}

/** Endpoint ainda não mapeado (Fase 0 pendente). */
export class FonteNaoMapeadaError extends ErroFonte {}
