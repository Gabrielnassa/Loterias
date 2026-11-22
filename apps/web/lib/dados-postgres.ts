import { buscarLotericas, calcularParticipacoes, lerLotericasConfiguradas, pagina, type LotericaRef, type ModalidadeSlug, type ParticipacaoInfo } from '@radar/core';
import { criarSql, type Sql } from '@radar/db';
import { FonteSimuladaRaioX, lojasDaSessao, type AberturaDetalhada, type AoVivo, type BolaoDaJanela, type FonteDadosRaioX, type MinhaLotericaRef } from './dados';

/**
 * Fonte de dados da web lendo do PostgreSQL: `aberturas` e `abertura_participacoes` (gravadas pelo
 * job de fim de janela do coletor ou pelo seed de demonstração) e `boloes` (detalhe da abertura).
 * Leituras pesadas ficam em cache curto; a grade de 12 semanas é montada em memória pelas regras do core.
 */
const CACHE_MS = 30_000;

interface Cache<T> {
  em: number;
  valor: Promise<T>;
}

/** O driver pode devolver timestamptz como texto (o Drizzle troca os conversores da conexão). */
function data(v: Date | string): Date;
function data(v: Date | string | null): Date | null;
function data(v: Date | string | null): Date | null {
  if (v === null) return null;
  return v instanceof Date ? v : new Date(v);
}

function idAbertura(slug: string, numero: number): string {
  return `${slug}-${numero}`;
}

function lerIdAbertura(id: string): { slug: string; numero: number } | null {
  const m = /^(.+)-(\d+)$/.exec(id);
  return m ? { slug: m[1]!, numero: Number(m[2]) } : null;
}

export class FontePostgresRaioX implements FonteDadosRaioX {
  readonly tipo = 'postgres' as const;
  /** Conexão (usada também pela "Minha lotérica"). */
  readonly sql: Sql;
  private caches = new Map<string, Cache<unknown>>();
  private simuladaAoVivo: FonteSimuladaRaioX | null = null;

  constructor(
    url: string | Sql,
    private readonly relogio: () => Date = () => new Date(),
    private readonly opcoes: { minhaLoterica?: string } = {},
  ) {
    this.sql = typeof url === 'string' ? criarSql(url, { max: 5 }) : url;
  }

  agora(): Date {
    return this.relogio();
  }

  private cache<T>(chave: string, f: () => Promise<T>): Promise<T> {
    const c = this.caches.get(chave) as Cache<T> | undefined;
    if (c && Date.now() - c.em < CACHE_MS) return c.valor;
    const valor = f();
    this.caches.set(chave, { em: Date.now(), valor });
    valor.catch(() => this.caches.delete(chave));
    return valor;
  }

  async simulado(): Promise<boolean> {
    return this.cache('simulado', async () => {
      const [r] = await this.sql<{ existe: boolean }[]>`select exists(select 1 from concursos where origem = 'seed') as existe`;
      return r?.existe ?? false;
    });
  }

  async lotericas(): Promise<LotericaRef[]> {
    return this.cache('lotericas', async () => {
      const linhas = await this.sql<{ codigo_caixa: string; nome: string; cidade: string; uf: string; bairro: string | null }[]>`
        select codigo_caixa, nome, cidade, uf, bairro from lotericas order by nome`;
      return linhas.map((l) => ({ codigoCaixa: l.codigo_caixa, nome: l.nome, cidade: l.cidade, uf: l.uf, ...(l.bairro ? { bairro: l.bairro } : {}) }));
    });
  }

  async loterica(codigo: string): Promise<LotericaRef | null> {
    return (await this.lotericas()).find((l) => l.codigoCaixa === codigo) ?? null;
  }

  async buscar(termo: string, limite = 20): Promise<LotericaRef[]> {
    return buscarLotericas(await this.lotericas(), termo, limite);
  }

  async aberturas(): Promise<AberturaDetalhada[]> {
    return this.cache('aberturas', async () => {
      const linhas = await this.sql<{ slug: ModalidadeSlug; numero: number; t0: Date; escopo_colocacao: 'vitrine' | 'monitoradas' }[]>`
        select m.slug, c.numero, a.t0, a.escopo_colocacao
        from aberturas a join concursos c on c.id = a.concurso_id join modalidades m on m.id = c.modalidade_id
        where a.processada_em is not null
        order by a.t0`;
      return linhas.map((a) => ({ id: idAbertura(a.slug, a.numero), modalidade: a.slug, concurso: a.numero, t0: data(a.t0), escopoColocacao: a.escopo_colocacao }));
    });
  }

  async participacoes(): Promise<ParticipacaoInfo[]> {
    return this.cache('participacoes', async () => {
      const linhas = await this.sql<
        {
          slug: string;
          numero: number;
          codigo_caixa: string;
          primeiro_em: Date;
          atraso_s: string;
          pos_cidade: number;
          pos_uf: number;
          pos_brasil: number;
          n_boloes_1h: number;
          valor_1h: string;
          pct_vendido: string | null;
          sobra: string | null;
          empate: boolean;
        }[]
      >`
        select m.slug, c.numero, l.codigo_caixa, p.primeiro_em, p.atraso_s, p.pos_cidade, p.pos_uf, p.pos_brasil,
               p.n_boloes_1h, p.valor_1h, p.pct_vendido, p.sobra, p.empate
        from abertura_participacoes p
        join aberturas a on a.id = p.abertura_id
        join concursos c on c.id = a.concurso_id
        join modalidades m on m.id = c.modalidade_id
        join lotericas l on l.id = p.loterica_id
        where a.processada_em is not null and a.t0 >= ${new Date(this.agora().getTime() - 14 * 7 * 86_400_000).toISOString()}::timestamptz`;
      return linhas.map((p) => ({
        aberturaId: idAbertura(p.slug, p.numero),
        lotericaCodigo: p.codigo_caixa,
        primeiroEm: data(p.primeiro_em),
        atrasoS: Number(p.atraso_s),
        posCidade: p.pos_cidade,
        posUf: p.pos_uf,
        posBrasil: p.pos_brasil,
        nBoloes1h: p.n_boloes_1h,
        valor1h: Number(p.valor_1h),
        pctVendido: p.pct_vendido === null ? null : Number(p.pct_vendido),
        sobra: p.sobra === null ? null : Number(p.sobra),
        empate: p.empate,
      }));
    });
  }

  async abertura(id: string): Promise<AberturaDetalhada | null> {
    return (await this.aberturas()).find((a) => a.id === id) ?? null;
  }

  private async boloesDoConcurso(slug: string, numero: number, ate?: Date) {
    const linhas = await this.sql<
      {
        id_caixa: string;
        codigo_caixa: string;
        nome: string;
        cidade: string;
        uf: string;
        bairro: string | null;
        first_seen_at: Date;
        fila: number;
        jogos: number;
        dezenas: number;
        cotas_total: number;
        cotas_disponiveis: number;
        valor_cota: string;
        sobra_final: number | null;
        esgotou_em: Date | null;
        pos_brasil: number;
        pos_uf: number;
        pos_cidade: number;
        empate_entrada: boolean;
        ordem_primeira_leitura: number | null;
        estornado: boolean;
      }[]
    >`
      select b.id_caixa, l.codigo_caixa, l.nome, l.cidade, l.uf, l.bairro, b.first_seen_at, b.fila, b.jogos, b.dezenas,
             b.cotas_total, b.cotas_disponiveis, b.valor_cota, b.sobra_final, b.esgotou_em,
             coalesce(b.pos_entrada_brasil, b.pos_entrada_calc_brasil) as pos_brasil,
             coalesce(b.pos_entrada_uf, b.pos_entrada_calc_uf) as pos_uf,
             coalesce(b.pos_entrada_cidade, b.pos_entrada_calc_cidade) as pos_cidade,
             b.empate_entrada, b.ordem_primeira_leitura, b.estornado
      from boloes b
      join concursos c on c.id = b.concurso_id
      join modalidades m on m.id = c.modalidade_id
      join lotericas l on l.id = b.loterica_id
      where m.slug = ${slug} and c.numero = ${numero}
        ${ate ? this.sql`and b.first_seen_at <= ${ate.toISOString()}::timestamptz` : this.sql``}
      order by b.first_seen_at, b.ordem_primeira_leitura`;
    return linhas.map((b) => ({
      id: b.id_caixa,
      loterica: { codigoCaixa: b.codigo_caixa, nome: b.nome, cidade: b.cidade, uf: b.uf, ...(b.bairro ? { bairro: b.bairro } : {}) } as LotericaRef,
      firstSeenAt: data(b.first_seen_at),
      fila: b.fila,
      jogos: b.jogos,
      dezenas: b.dezenas,
      cotasTotal: b.cotas_total,
      cotasDisponiveis: b.cotas_disponiveis,
      valorCotaBase: Number(b.valor_cota),
      sobraFinal: b.sobra_final,
      esgotouEm: data(b.esgotou_em),
      posEntrada: {
        brasil: { posicao: b.pos_brasil, pagina: pagina(b.pos_brasil) },
        uf: { posicao: b.pos_uf, pagina: pagina(b.pos_uf) },
        cidade: { posicao: b.pos_cidade, pagina: pagina(b.pos_cidade) },
      },
      empate: b.empate_entrada,
      ordemFonte: b.ordem_primeira_leitura ?? 0,
      estornado: b.estornado,
    }));
  }

  async boloesDaAbertura(id: string): Promise<BolaoDaJanela[] | null> {
    const a = await this.abertura(id);
    const chave = lerIdAbertura(id);
    if (!a || !chave) return null;
    return this.boloesDoConcurso(chave.slug, chave.numero, new Date(a.t0.getTime() + 60 * 60_000));
  }

  /**
   * Abertura em andamento (T0 <= agora < T0 + 60 min): participações calculadas na hora a partir dos
   * bolões já vistos. Sem abertura em andamento: com o seed, a demonstração simulada; senão, a última.
   */
  async aoVivo(agora: Date): Promise<AoVivo> {
    const [atual] = await this.sql<{ slug: ModalidadeSlug; numero: number; abre_em: Date }[]>`
      select m.slug, c.numero, c.abre_em from concursos c join modalidades m on m.id = c.modalidade_id
      where c.abre_em <= ${agora.toISOString()}::timestamptz and c.abre_em > ${new Date(agora.getTime() - 3_600_000).toISOString()}::timestamptz
      order by c.abre_em desc limit 1`;
    if (!atual && (await this.simulado())) {
      this.simuladaAoVivo ??= new FonteSimuladaRaioX(() => this.agora());
      return this.simuladaAoVivo.aoVivo(agora);
    }
    const alvo =
      atual ??
      (await this.sql<{ slug: ModalidadeSlug; numero: number; abre_em: Date }[]>`
        select m.slug, c.numero, c.abre_em from concursos c join modalidades m on m.id = c.modalidade_id
        where c.abre_em <= ${agora.toISOString()}::timestamptz order by c.abre_em desc limit 1`)[0];
    if (!alvo) return { emAndamento: false, t0: agora, modalidade: 'lotofacil', ultimaLeitura: null, participacoes: [] };
    const boloes = await this.boloesDoConcurso(alvo.slug, alvo.numero, agora);
    const [leitura] = await this.sql<{ em: Date | null }[]>`
      select max(iniciou_em) as em from coletas where modalidade = ${alvo.slug} and concurso = ${alvo.numero} and tipo = 'varredura' and erro is null`;
    return {
      emAndamento: Boolean(atual),
      t0: data(alvo.abre_em),
      modalidade: alvo.slug,
      ultimaLeitura: data(leitura?.em ?? null),
      participacoes: calcularParticipacoes({ t0: data(alvo.abre_em) }, boloes),
    };
  }

  /**
   * Lotéricas do dono: RADAR_MINHA_LOTERICA aceita várias, separadas por vírgula, cada uma `código`
   * ou `código=Nome`, e o código em qualquer forma (21.002894-7, 210028947, 002894 ou 2894).
   * Sem configuração e com o seed: a lotérica fictícia de demonstração (980011).
   */
  async minhasLotericas(): Promise<MinhaLotericaRef[]> {
    const ls = await this.lotericas();
    const sessao = await lojasDaSessao(ls);
    if (sessao) return sessao;
    const config = lerLotericasConfiguradas(this.opcoes.minhaLoterica ?? process.env.RADAR_MINHA_LOTERICA);
    if (!config.length) {
      const demo = (await this.simulado()) ? ls.find((l) => l.codigoCaixa === '980011') : undefined;
      return demo ? [demo] : [];
    }
    return config.map((c) => {
      const l = ls.find((x) => x.codigoCaixa === c.codigoCaixa);
      // configurada mas ainda sem bolões vistos pelo coletor
      return l ? { ...l, ...(c.nome ? { nome: c.nome } : {}) } : { codigoCaixa: c.codigoCaixa, nome: c.nome ?? `Lotérica ${c.codigoInformado}`, cidade: '', uf: '', semDados: true };
    });
  }

  async minhaLoterica(): Promise<MinhaLotericaRef | null> {
    return (await this.minhasLotericas())[0] ?? null;
  }

  async fechar(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

