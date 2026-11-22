import { existsSync, statSync } from 'node:fs';
import {
  ESCOPOS_VITRINE,
  paginasConhecidas,
  registrarEscopo,
  type EscopoNaNavegacao,
  type EscopoVitrine,
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
  SessaoExpiradaError,
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
 *  - NÃO faz login. A lista geral exige login: uma pessoa faz o login da conta DEDICADA da empresa
 *    uma vez (`caixa:preparar-sessao`) e o robô reaproveita a sessão. Se ela expirar, para com
 *    SessaoExpiradaError e avisa; quando a pessoa renova o arquivo de sessão, a coleta volta sozinha.
 *    Sem conta, só funciona o link público da lotérica (`#/bolao-caixa/{código}`, ver caixa-links.ts).
 *    Nunca usar a conta pessoal de ninguém.
 *  - NÃO tenta burlar proteção anti-robô: 401/403/captcha param tudo (BloqueadoPelaFonteError).
 *  - Ritmo baixo e configurável entre ações, backoff exponencial em falhas transitórias.
 */
export type EstadoSessao = string | Exclude<Parameters<Browser['newContext']>[0], undefined>['storageState'];

export interface OpcoesCaixaNavegador {
  baseUrl?: string;
  /** storageState do Playwright preparado por uma pessoa (caminho do JSON ou o objeto). */
  estadoSessao?: EstadoSessao;
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
  /** Texto dos botões de próxima e de página anterior. */
  textoSeguinte?: string;
  textoAnterior?: string;
  /** A sessão é de uma conta dedicada logada: voltar para a home = sessão expirada. */
  contaDedicada?: boolean;
  /** Cache das páginas brutas do link de uma lotérica (modo links). */
  cacheLinkMs?: number;
  /** Trata a ordem da lista como a ordem da vitrine (default false: lista é por cidade do comprador). */
  confiarOrdemDaFonte?: boolean;
  /**
   * Até que escopo a varredura segue: 'cidade' (padrão; só a cidade da conta), 'estado' (continua no
   * resto do estado depois da última página da cidade) ou 'brasil'. Ver core/fonte/escopos.ts.
   */
  escopos?: EscopoVitrine;
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
  textoAnterior: 'Anterior',
  cacheLinkMs: 20_000,
};

const CAMINHOS_LISTA = new Set<string>([CAMINHOS_CAIXA.boloesDisponiveis, CAMINHOS_CAIXA.boloesDisponiveisLink]);
const MARCAS_DESAFIO = /captcha|perfdrive|challenge|access denied|acesso negado|bot detect/i;

interface Aba {
  page: Page;
  /** Página GLOBAL (contando desde a 1ª da cidade; o escopo seguinte continua a numeração). */
  paginaAtual: number;
  /** Escopos vistos nesta aba (cidade, resto do estado...). */
  escopos?: EscopoNaNavegacao[];
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
  private readonly cacheLink = new Map<string, { em: number; jsons: unknown[] }>();
  private sessaoCarregadaMtime = 0;
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
    if (typeof storageState === 'string') {
      if (!existsSync(storageState)) {
        this.registrar('arquivo de sessão não encontrado; seguindo sem sessão', { estadoSessao: storageState });
        storageState = undefined;
      } else {
        this.sessaoCarregadaMtime = statSync(storageState).mtimeMs;
      }
    }
    this.contexto = await this.browser.newContext({
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      ...(storageState ? { storageState } : {}),
    });
    return this.contexto;
  }

  /** Se uma pessoa renovou o arquivo de sessão (ex.: refez o login), recomeça com a sessão nova. */
  private async recarregarSeSessaoMudou(): Promise<void> {
    const arq = this.o.estadoSessao;
    if (typeof arq !== 'string' || !this.contexto || !existsSync(arq)) return;
    const mtime = statSync(arq).mtimeMs;
    if (mtime <= this.sessaoCarregadaMtime) return;
    this.registrar('arquivo de sessão renovado: recarregando o navegador');
    await this.fechar();
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
      if (this.o.contaDedicada) {
        return new SessaoExpiradaError(
          'a sessão da conta dedicada expirou (o portal voltou para a home). Uma pessoa precisa refazer o login: `pnpm caixa:preparar-sessao`. A coleta volta sozinha quando o arquivo de sessão for renovado.',
        );
      }
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

  /** Clica num botão de paginação e devolve o JSON da lista (null se o botão não existe/está desabilitado). */
  private async clicar(aba: Aba, texto: string): Promise<unknown | null> {
    const botao = aba.page.getByText(texto, { exact: true }).first();
    const disponivel = (await botao.count()) > 0 && (await botao.isVisible()) && (await botao.isEnabled());
    if (!disponivel) return null;
    await this.aguardarVez();
    return this.esperarLista(aba.page, () => botao.click());
  }

  /**
   * Vai até a página pedida pelo caminho mais curto: "Seguinte" para frente, "Anterior" para trás,
   * e Anterior + Seguinte para reler a página atual (leitura da borda da 1ª fila com 2 ações).
   */
  private async irPara(aba: Aba, consulta: Pick<ConsultaBoloes, 'modalidade' | 'codigoLoterica' | 'pagina'>): Promise<unknown | null> {
    const alvo = consulta.pagina;
    let json: unknown = null;
    const recarregar = aba.paginaAtual === 0 || alvo === 1 || (alvo < aba.paginaAtual && aba.paginaAtual - alvo > alvo - 1);
    if (recarregar) json = await this.carregarPrimeira(aba, consulta);
    else if (alvo === aba.paginaAtual) {
      const r = await this.clicar(aba, this.o.textoAnterior);
      if (r === null) json = await this.carregarPrimeira(aba, consulta);
      else aba.paginaAtual--;
    }
    while (aba.paginaAtual > alvo) {
      const r = await this.clicar(aba, this.o.textoAnterior);
      if (r === null) {
        json = await this.carregarPrimeira(aba, consulta);
        break;
      }
      json = r;
      aba.paginaAtual--;
    }
    while (aba.paginaAtual < alvo) {
      const r = await this.clicar(aba, this.o.textoSeguinte);
      if (r === null) return null; // não há próxima página: fim da lista
      json = r;
      aba.paginaAtual++;
    }
    return json;
  }

  async pagina(consulta: ConsultaBoloes): Promise<PaginaBoloes> {
    return this.comRetentativas(async () => {
      await this.recarregarSeSessaoMudou();
      const chave = consulta.codigoLoterica ? `loterica:${consulta.codigoLoterica}` : `modalidade:${consulta.modalidade}`;
      const aba = await this.aba(chave);
      const json = await this.irPara(aba, consulta);
      if (json === null) {
        return { consulta, pagina: consulta.pagina, tamanhoPagina: 30, itens: [], ordemDaVitrine: this.o.confiarOrdemDaFonte ?? false, obtidaEm: this.agora(), haMais: false };
      }
      const p = normalizarPaginaCaixa(json, consulta, {
        obtidaEm: this.agora(),
        ...(this.o.confiarOrdemDaFonte !== undefined ? { confiarOrdemDaFonte: this.o.confiarOrdemDaFonte } : {}),
      });
      // escopo da página (cidade, resto do estado...): a numeração da fonte recomeça a cada escopo
      const c = { paginaAtual: p.pagina, ultimaPagina: p.totalPaginas ?? p.pagina, totalRegistros: p.totalItens ?? p.itens.length };
      const r = registrarEscopo(aba.escopos ?? [], consulta.pagina, c);
      aba.escopos = r.escopos;
      p.escopo = { indice: r.indice, nome: ESCOPOS_VITRINE[Math.min(r.indice, 2)]!, pagina: c.paginaAtual, totalPaginas: c.ultimaPagina, totalItens: c.totalRegistros };
      const maxEscopo = Math.max(0, ESCOPOS_VITRINE.indexOf(this.o.escopos ?? 'cidade'));
      if (maxEscopo > 0) {
        // numeração GLOBAL: a varredura segue do fim da cidade para a 1ª página do estado
        p.pagina = consulta.pagina;
        p.haMais = c.paginaAtual < c.ultimaPagina || r.indice < maxEscopo;
        p.totalPaginas = paginasConhecidas(aba.escopos) + (r.indice < maxEscopo && r.indice === aba.escopos.length - 1 ? 1 : 0);
        p.totalItens = aba.escopos.reduce((t, e) => t + e.totalRegistros, 0);
      }
      return p;
    });
  }

  /**
   * Páginas BRUTAS do link público de uma lotérica (todas as modalidades), com cache curto para
   * várias consultas da mesma rodada não recarregarem o portal. Base do modo links (sem conta).
   */
  async paginasBrutasDaLoterica(codigo: string, maxPaginas = 10): Promise<{ jsons: unknown[]; obtidaEm: Date }> {
    const c = this.cacheLink.get(codigo);
    if (c && Date.now() - c.em < this.o.cacheLinkMs) return { jsons: c.jsons, obtidaEm: new Date(c.em) };
    return this.comRetentativas(async () => {
      await this.recarregarSeSessaoMudou();
      const aba = await this.aba(`loterica:${codigo}`);
      const jsons: unknown[] = [];
      let json: unknown = await this.carregarPrimeira(aba, { modalidade: 'mega-sena', codigoLoterica: codigo });
      while (json !== null && jsons.length < maxPaginas) {
        jsons.push(json);
        const ultima = (json as { payload?: { ultimaPagina?: unknown } }).payload?.ultimaPagina;
        if (typeof ultima === 'number' && aba.paginaAtual >= ultima) break;
        json = await this.clicar(aba, this.o.textoSeguinte);
        if (json !== null) aba.paginaAtual++;
      }
      const em = Date.now();
      this.cacheLink.set(codigo, { em, jsons });
      return { jsons, obtidaEm: new Date(em) };
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
    for (const a of this.abas.values()) await a.page.close().catch(() => {});
    await this.contexto?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.contexto = null;
    this.browser = null;
    this.abas.clear();
  }
}
