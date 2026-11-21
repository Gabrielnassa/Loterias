import {
  BloqueadoPelaFonteError,
  FonteIndisponivelError,
  FormatoInesperadoError,
  LimiteDeRequisicoesError,
} from './erros';

/**
 * Cliente HTTP "educado" para fontes públicas (SPEC, Riscos: uso responsável da fonte).
 * - Intervalo mínimo entre requisições (global, serializado).
 * - Backoff exponencial com jitter em falhas transitórias (rede, timeout, 5xx).
 * - 429: respeita Retry-After e DOBRA o intervalo mínimo (volta aos poucos com sucessos).
 * - 401/403 ou página de desafio/captcha: para na hora (BloqueadoPelaFonteError). Nunca tenta burlar.
 * - User-Agent genérico e honesto; nenhum dado do usuário/cliente vai nos cabeçalhos.
 */
export interface OpcoesClienteHttp {
  intervaloMinimoMs?: number;
  intervaloMaximoMs?: number;
  maxTentativas?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  timeoutMs?: number;
  userAgent?: string;
  fetch?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
  agora?: () => number;
  aleatorio?: () => number;
}

export interface RespostaHttp {
  status: number;
  url: string;
  headers: Headers;
  texto: string;
  json<T = unknown>(): T;
}

const PADRAO = {
  intervaloMinimoMs: 250,
  intervaloMaximoMs: 10_000,
  maxTentativas: 4,
  backoffBaseMs: 1_000,
  backoffMaxMs: 60_000,
  timeoutMs: 10_000,
  userAgent: 'radar-loterico-coletor/0.1 (+coleta de vitrine publica; limite de requisicoes ativo)',
};

const MARCAS_DESAFIO = /captcha|recaptcha|hcaptcha|cf-chl|challenge-platform|access denied|acesso negado|bot detect/i;

export function lerRetryAfter(valor: string | null, agoraMs: number): number | undefined {
  if (!valor) return undefined;
  const s = Number(valor);
  if (Number.isFinite(s) && s >= 0) return s * 1000;
  const data = Date.parse(valor);
  if (Number.isFinite(data)) return Math.max(0, data - agoraMs);
  return undefined;
}

export class ClienteHttpEducado {
  private readonly o: Required<Omit<OpcoesClienteHttp, 'fetch' | 'dormir' | 'agora' | 'aleatorio'>>;
  private readonly fetchImpl: typeof fetch;
  private readonly dormir: (ms: number) => Promise<void>;
  private readonly agora: () => number;
  private readonly aleatorio: () => number;
  private intervaloAtual: number;
  private proximaLiberacao = 0;
  private fila: Promise<void> = Promise.resolve();

  constructor(opcoes: OpcoesClienteHttp = {}) {
    this.o = {
      intervaloMinimoMs: opcoes.intervaloMinimoMs ?? PADRAO.intervaloMinimoMs,
      intervaloMaximoMs: opcoes.intervaloMaximoMs ?? PADRAO.intervaloMaximoMs,
      maxTentativas: opcoes.maxTentativas ?? PADRAO.maxTentativas,
      backoffBaseMs: opcoes.backoffBaseMs ?? PADRAO.backoffBaseMs,
      backoffMaxMs: opcoes.backoffMaxMs ?? PADRAO.backoffMaxMs,
      timeoutMs: opcoes.timeoutMs ?? PADRAO.timeoutMs,
      userAgent: opcoes.userAgent ?? PADRAO.userAgent,
    };
    this.fetchImpl = opcoes.fetch ?? globalThis.fetch.bind(globalThis);
    this.dormir = opcoes.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.agora = opcoes.agora ?? Date.now;
    this.aleatorio = opcoes.aleatorio ?? Math.random;
    this.intervaloAtual = this.o.intervaloMinimoMs;
  }

  /** Intervalo mínimo vigente entre requisições (sobe após 429). */
  get intervaloVigenteMs(): number {
    return this.intervaloAtual;
  }

  /** Garante o espaçamento mínimo entre requisições, mesmo com chamadas concorrentes. */
  private async aguardarVez(): Promise<void> {
    const anterior = this.fila;
    let liberar!: () => void;
    this.fila = new Promise<void>((r) => (liberar = r));
    await anterior;
    try {
      const espera = this.proximaLiberacao - this.agora();
      if (espera > 0) await this.dormir(espera);
      this.proximaLiberacao = this.agora() + this.intervaloAtual;
    } finally {
      liberar();
    }
  }

  private backoff(tentativa: number): number {
    const teto = Math.min(this.o.backoffMaxMs, this.o.backoffBaseMs * 2 ** (tentativa - 1));
    return Math.round(teto / 2 + (this.aleatorio() * teto) / 2);
  }

  async obter(url: string, init: { headers?: Record<string, string>; sinal?: AbortSignal; esperaJson?: boolean } = {}): Promise<RespostaHttp> {
    let ultimoErro: unknown;
    for (let tentativa = 1; tentativa <= this.o.maxTentativas; tentativa++) {
      await this.aguardarVez();
      const sinais = [AbortSignal.timeout(this.o.timeoutMs)];
      if (init.sinal) sinais.push(init.sinal);
      let resp: Response;
      try {
        resp = await this.fetchImpl(url, {
          method: 'GET',
          headers: { 'user-agent': this.o.userAgent, accept: init.esperaJson ? 'application/json' : '*/*', ...init.headers },
          signal: AbortSignal.any(sinais),
        });
      } catch (e) {
        if (init.sinal?.aborted) throw e;
        ultimoErro = e;
        if (tentativa < this.o.maxTentativas) await this.dormir(this.backoff(tentativa));
        continue;
      }

      const texto = await resp.text();
      if (resp.status === 401 || resp.status === 403) {
        throw new BloqueadoPelaFonteError(`fonte recusou o acesso (HTTP ${resp.status}) em ${url}`, resp.status);
      }
      if (resp.status === 429) {
        this.intervaloAtual = Math.min(this.o.intervaloMaximoMs, this.intervaloAtual * 2);
        const esperar = lerRetryAfter(resp.headers.get('retry-after'), this.agora()) ?? this.backoff(tentativa);
        ultimoErro = new LimiteDeRequisicoesError(`HTTP 429 em ${url}`, esperar);
        if (tentativa < this.o.maxTentativas) await this.dormir(Math.min(esperar, this.o.backoffMaxMs));
        continue;
      }
      if (resp.status >= 500) {
        ultimoErro = new FonteIndisponivelError(`HTTP ${resp.status} em ${url}`);
        if (tentativa < this.o.maxTentativas) await this.dormir(this.backoff(tentativa));
        continue;
      }

      const tipo = resp.headers.get('content-type') ?? '';
      if (init.esperaJson && !tipo.includes('json')) {
        if (MARCAS_DESAFIO.test(texto)) {
          throw new BloqueadoPelaFonteError(`fonte devolveu página de desafio/captcha em ${url}`, resp.status);
        }
        throw new FormatoInesperadoError(`esperava JSON e veio "${tipo || 'sem content-type'}" em ${url}`);
      }

      // sucesso: o intervalo volta devagar ao mínimo (10% por resposta)
      this.intervaloAtual = Math.max(this.o.intervaloMinimoMs, Math.round(this.intervaloAtual * 0.9));
      return {
        status: resp.status,
        url,
        headers: resp.headers,
        texto,
        json<T>() {
          try {
            return JSON.parse(texto) as T;
          } catch (e) {
            throw new FormatoInesperadoError(`JSON inválido em ${url}`, e);
          }
        },
      };
    }
    if (ultimoErro instanceof LimiteDeRequisicoesError) throw ultimoErro;
    throw new FonteIndisponivelError(
      `fonte indisponível após ${this.o.maxTentativas} tentativas: ${url}`,
      { cause: ultimoErro },
    );
  }
}
