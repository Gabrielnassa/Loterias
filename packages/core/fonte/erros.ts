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

/**
 * O portal pediu uma ação que só uma PESSOA pode fazer (ex.: "Você tem mais de 18 anos?",
 * aceite de termos). O coletor nunca responde sozinho: para e pede que o operador prepare a
 * sessão manualmente (`pnpm --filter @radar/worker caixa:preparar-sessao`).
 */
export class ConfirmacaoHumanaNecessariaError extends BloqueadoPelaFonteError {}

/** A tela exige login. O coletor não faz login sozinho nem usa conta pessoal. */
export class LoginNecessarioError extends ConfirmacaoHumanaNecessariaError {}

/**
 * A sessão da conta DEDICADA expirou (a lista geral voltou para a home). O robô para e avisa; uma
 * pessoa refaz o login com `pnpm caixa:preparar-sessao` e a coleta volta sozinha.
 */
export class SessaoExpiradaError extends LoginNecessarioError {}
