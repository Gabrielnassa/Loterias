import { existsSync } from 'node:fs';
import {
  BloqueadoPelaFonteError,
  CAMINHOS_CAIXA,
  caminhoDaUrlCaixa,
  concursosNaRespostaCaixa,
  ConfirmacaoHumanaNecessariaError,
  FonteIndisponivelError,
  FormatoInesperadoError,
  LimiteDeRequisicoesError,
  LoginNecessarioError,
  normalizarPaginaCaixa,
  type ConcursoAbertoFonte,
  type ConsultaBoloes,
  type ContagemFonte,
  type FonteBoloes,
  type ModalidadeSlug,
  type PaginaBoloes,
} from '@radar/core';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';

/**
 * Adaptador do Marketplace por NAVEGADOR REAL (Playwright).
 *
 * Abre a página como um usuário comum, pagina pelo botão "Seguinte" e lê as respostas JSON que o
 * PRÓPRIO site pede (`recuperar-boloes-disponiveis`, `-link`, `detalhar-bolao`).
 *
 * Limites deste adaptador (de propósito):
 *  - NÃO monta, reproduz nem decifra o parâmetro `q` (cifrado pelo site). Só observa respostas.
 *  - NÃO responde "Você tem mais de 18 anos?" nem aceita termos: se a tela aparecer, para com
 *    ConfirmacaoHumanaNecessariaError. Uma pessoa prepara a sessão (`caixa:preparar-sessao`).
 *  - NÃO faz login. A lista geral exige login; sem ele só funciona o link público da lotérica
 *    (`#/bolao-caixa/{código}`). Nunca usar a conta pessoal de ninguém.
 *  - NÃO tenta burlar proteção anti-robô: 401/403/captcha param tudo (BloqueadoPelaFonteError).
 *  - Ritmo baixo e configurável entre ações, backoff exponencial em falhas transitórias.
 */
export interface OpcoesCaixaNavegador {
  baseUrl?: string;
  /** storageState do Playwright preparado por uma pessoa (caminho do JSON ou o objeto). */
  estadoSessao?: string | Exclude<Parameters<Browser['newContext']>[0], undefined>['storageState'];
  headless?: boolean;
  executavel?: string;
  /** Intervalo mínimo entre ações no portal (carregar página ou clicar em Seguinte). */
  intervaloMinimoMs?: number;
  timeoutMs?: number;
  maxTentativas?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Validade do cache da 1ª página por modalidade (para concursosAbertos/contagens). */
  cacheListaMs?: number;
  /** Modalidades consultadas em concursosAbertos/contagens. */
  modalidades?: ModalidadeSlug[];
  /** Texto do botão de próxima página. */
  textoSeguinte?: string;
  /** Trata a ordem da lista como a ordem da vitrine (default false: lista é por cidade do comprador). */
  confiarOrdemDaFonte?: boolean;
  agora?: () => Date;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

const PADRAO = {
  baseUrl: 'https://www.loteriasonline.caixa.gov.br/silce-web/',
  intervaloMinimoMs: 3000,
  timeoutMs: 30_000,
  maxTentativas: 3,
  backoffBaseMs: 5_000,
  backoffMaxMs: 120_000,
  cacheListaMs: 10 * 60_000,
  textoSeguinte: 'Seguinte',
};

const CAMINHOS_LISTA = new Set<string>([CAMINHOS_CAIXA.boloesDisponiveis, CAMINHOS_CAIXA.boloesDisponiveisLink]);
const MARCAS_DESAFIO = /captcha|perfdrive|challenge|access denied|acesso negado|bot detect/i;

interface Aba {
  page: Page;
  paginaAtual: number;
}

class Desvio extends Error {
  constructor(readonly erro: Error) {
    super(erro.message);
  }
}

export class FonteCaixaNavegador implements FonteBoloes {
  readonly nome = 'caixa-navegador';
  private readonly o: OpcoesCaixaNavegador & typeof PADRAO;
  private browser: Browser | null = null;
  private contexto: BrowserContext | null = null;
  private readonly abas = new Map<string, Aba>();
  private proximaAcao = 0;
  private fila: Promise<void> = Promise.resolve();
  private readonly cacheLista = new Map<ModalidadeSlug, { em: number; json: unknown }>();
  /** Estatística: ações feitas no portal (cargas + cliques). */
  acoes = 0;

  constructor(opcoes: OpcoesCaixaNavegador = {}) {
    this.o = { ...PADRAO, ...opcoes };
  }

  private agora(): Date {
    return this.o.agora?.() ?? new Date();
  }

  private registrar(msg: string, extra?: Record<string, unknown>) {
    this.o.log?.(msg, extra);
  }

  private async contextoPronto(): Promise<BrowserContext> {
    if (this.contexto) return this.contexto;
    this.browser = await chromium.launch({
      headless: this.o.headless ?? true,
      ...(this.o.executavel ? { executablePath: this.o.executavel } : {}),
    });
    let storageState = this.o.estadoSessao;
    if (typeof storageState === 'string' && !existsSync(storageState)) {
      this.registrar('arquivo de sessão não encontrado; seguindo sem sessão', { estadoSessao: storageState });
      storageState = undefined;
    }
    this.contexto = await this.browser.newContext({
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      ...(storageState ? { storageState } : {}),
    });
    return this.contexto;
  }

  private async aba(chave: string): Promise<Aba> {
    let a = this.abas.get(chave);
    if (!a || a.page.isClosed()) {
      const ctx = await this.contextoPronto();
      a = { page: await ctx.newPage(), paginaAtual: 0 };
      this.abas.set(chave, a);
    }
    return a;
  }

  /** Ritmo: no máximo uma ação a cada intervaloMinimoMs (serializado entre abas). */
  private async aguardarVez(): Promise<void> {
    const anterior = this.fila;
    let liberar!: () => void;
    this.fila = new Promise<void>((r) => (liberar = r));
    await anterior;
    try {
      const espera = this.proximaAcao - Date.now();
      if (espera > 0) await new Promise((r) => setTimeout(r, espera));
      this.proximaAcao = Date.now() + this.o.intervaloMinimoMs;
      this.acoes++;
    } finally {
      liberar();
    }
  }

  /** Verifica se o portal desviou para uma tela que exige pessoa, login, ou um desafio anti-robô. */
  private verificarDesvio(page: Page, esperadoNaRota: boolean): Error | null {
    const url = page.url();
    if (MARCAS_DESAFIO.test(new URL(url).hostname) || /captcha/i.test(url)) {
      return new BloqueadoPelaFonteError(`o portal apresentou um desafio anti-robô (${new URL(url).hostname}); coleta parada`);
    }
    const hash = new URL(url).hash;
    if (hash.startsWith('#/termos-de-uso')) {
      return new ConfirmacaoHumanaNecessariaError(
        'o portal pediu a confirmação "Você tem mais de 18 anos?"/termos de uso. Uma pessoa precisa responder: rode `pnpm --filter @radar/worker caixa:preparar-sessao` e aponte CAIXA_SESSAO para o arquivo gerado.',
      );
    }
    if (esperadoNaRota && !hash.startsWith('#/bolao-caixa')) {
      return new LoginNecessarioError(
        'o portal saiu da lista de bolões (foi para a home): a lista geral exige login. Sem login, só o link público da lotérica (#/bolao-caixa/{código}) funciona.',
      );
    }
    return null;
  }

  /** Executa a ação e espera a resposta da lista de bolões, vigiando desvios de tela. */
  private async esperarLista(page: Page, acao: () => Promise<unknown>): Promise<unknown> {
    let ativo = true;
    const resposta = page.waitForResponse((r) => CAMINHOS_LISTA.has(caminhoDaUrlCaixa(r.url()) ?? ''), {
      timeout: this.o.timeoutMs,
    });
    resposta.catch(() => {});
    try {
      await acao();
      // só depois da navegação/clique: o app redireciona (termos, home) logo após carregar a rota
      const vigia = (async () => {
        while (ativo) {
          const d = this.verificarDesvio(page, true);
          if (d) throw new Desvio(d);
          await new Promise((r) => setTimeout(r, 200));
        }
        return null;
      })();
      vigia.catch(() => {});
      const r = (await Promise.race([resposta, vigia])) as Response;
      return await this.lerResposta(r);
    } catch (e) {
      if (e instanceof Desvio) throw e.erro;
      // antes de culpar a rede, confere se a tela desviou
      const d = this.verificarDesvio(page, true);
      if (d) throw d;
      if (e instanceof Error && /Timeout/i.test(e.name + e.message)) {
        throw new FonteIndisponivelError(`sem resposta da lista de bolões em ${this.o.timeoutMs} ms`, { cause: e });
      }
      throw e;
    } finally {
      ativo = false;
    }
  }

  private async lerResposta(r: Response): Promise<unknown> {
    const status = r.status();
    if (status === 401 || status === 403) throw new BloqueadoPelaFonteError(`a fonte recusou a lista de bolões (HTTP ${status})`, status);
    if (status === 429) throw new LimiteDeRequisicoesError('HTTP 429 na lista de bolões');
    if (status >= 500) throw new FonteIndisponivelError(`HTTP ${status} na lista de bolões`);
    const texto = await r.text();
    const tipo = r.headers()['content-type'] ?? '';
    if (!tipo.includes('json')) {
      if (MARCAS_DESAFIO.test(texto)) throw new BloqueadoPelaFonteError('a fonte devolveu um desafio anti-robô no lugar do JSON', status);
      throw new FormatoInesperadoError(`a lista de bolões veio como "${tipo || 'sem content-type'}"`);
    }
    try {
      return JSON.parse(texto);
    } catch (e) {
      throw new FormatoInesperadoError('JSON inválido na lista de bolões', e);
    }
  }

  private urlDe(consulta: Pick<ConsultaBoloes, 'modalidade' | 'codigoLoterica'>): string {
    const rota = consulta.codigoLoterica ? `#/bolao-caixa/${consulta.codigoLoterica}` : `#/bolao-caixa/${consulta.modalidade}`;
    return new URL(rota, this.o.baseUrl).toString();
  }

  private async comRetentativas<T>(fn: () => Promise<T>): Promise<T> {
    let ultimo: unknown;
    for (let t = 1; t <= this.o.maxTentativas; t++) {
      try {
        return await fn();
      } catch (e) {
        // bloqueio, pedido de pessoa/login e formato: não adianta repetir
        if (e instanceof BloqueadoPelaFonteError || e instanceof FormatoInesperadoError) throw e;
        ultimo = e;
        if (t < this.o.maxTentativas) {
          const teto = Math.min(this.o.backoffMaxMs, this.o.backoffBaseMs * 2 ** (t - 1));
          const espera = Math.round(teto / 2 + (Math.random() * teto) / 2);
          this.registrar('falha transitória no portal; tentando de novo', { tentativa: t, esperaMs: espera, erro: String(e) });
          for (const a of this.abas.values()) a.paginaAtual = 0; // recomeça da página 1
          await new Promise((r) => setTimeout(r, espera));
        }
      }
    }
    if (ultimo instanceof LimiteDeRequisicoesError) throw ultimo;
    throw new FonteIndisponivelError(`portal indisponível após ${this.o.maxTentativas} tentativas`, { cause: ultimo });
  }

  /** Carrega (ou recarrega) a página 1 da rota e devolve o JSON bruto. */
  private async carregarPrimeira(aba: Aba, consulta: Pick<ConsultaBoloes, 'modalidade' | 'codigoLoterica'>): Promise<unknown> {
    const url = this.urlDe(consulta);
    await this.aguardarVez();
    const json = await this.esperarLista(aba.page, () =>
      aba.page.url() === url ? aba.page.reload({ waitUntil: 'domcontentloaded' }) : aba.page.goto(url, { waitUntil: 'domcontentloaded' }),
    );
    aba.paginaAtual = 1;
    if (!consulta.codigoLoterica) this.cacheLista.set(consulta.modalidade, { em: Date.now(), json });
    return json;
  }

  async pagina(consulta: ConsultaBoloes): Promise<PaginaBoloes> {
    return this.comRetentativas(async () => {
      const chave = consulta.codigoLoterica ? `loterica:${consulta.codigoLoterica}` : `modalidade:${consulta.modalidade}`;
      const aba = await this.aba(chave);
      let json: unknown;
      if (consulta.pagina === 1 || aba.paginaAtual === 0 || consulta.pagina <= aba.paginaAtual) {
        json = await this.carregarPrimeira(aba, consulta);
      }
      while (aba.paginaAtual < consulta.pagina) {
        const botao = aba.page.getByText(this.o.textoSeguinte, { exact: true }).first();
        const disponivel = (await botao.count()) > 0 && (await botao.isVisible()) && (await botao.isEnabled());
        if (!disponivel) {
          // não há próxima página: fim da lista
          return {
            consulta,
            pagina: consulta.pagina,
            tamanhoPagina: 30,
            itens: [],
            ordemDaVitrine: this.o.confiarOrdemDaFonte ?? false,
            obtidaEm: this.agora(),
          };
        }
        await this.aguardarVez();
        json = await this.esperarLista(aba.page, () => botao.click());
        aba.paginaAtual++;
      }
      return normalizarPaginaCaixa(json, consulta, {
        obtidaEm: this.agora(),
        ...(this.o.confiarOrdemDaFonte !== undefined ? { confiarOrdemDaFonte: this.o.confiarOrdemDaFonte } : {}),
      });
    });
  }

  /** 1ª página bruta de uma modalidade, com cache (base de concursosAbertos e contagens). */
  private async primeiraPaginaBruta(modalidade: ModalidadeSlug): Promise<unknown> {
    const c = this.cacheLista.get(modalidade);
    if (c && Date.now() - c.em < this.o.cacheListaMs) return c.json;
    return this.comRetentativas(async () => this.carregarPrimeira(await this.aba(`modalidade:${modalidade}`), { modalidade }));
  }

  async concursosAbertos(): Promise<ConcursoAbertoFonte[]> {
    const r: ConcursoAbertoFonte[] = [];
    for (const m of this.o.modalidades ?? []) r.push(...concursosNaRespostaCaixa(await this.primeiraPaginaBruta(m)));
    return r;
  }

  /** Contagem = totalRegistros da lista (no escopo da sessão: a cidade de quem está logado). */
  async contagens(): Promise<ContagemFonte[]> {
    const r: ContagemFonte[] = [];
    for (const m of this.o.modalidades ?? []) {
      const json = (await this.primeiraPaginaBruta(m)) as { payload?: { totalRegistros?: number } };
      const [c] = concursosNaRespostaCaixa(json);
      if (c) r.push({ modalidade: m, concurso: c.concurso, boloes: json.payload?.totalRegistros ?? 0 });
    }
    return r;
  }

  async fechar(): Promise<void> {
    await this.contexto?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.contexto = null;
    this.browser = null;
    this.abas.clear();
  }
}
