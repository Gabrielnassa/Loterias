import type { Caixa, CarroForte, DespesaFixa, Fechamento, Fiado, Lancamento } from '@radar/core';
import type { Sql } from '@radar/db';

/** Gestão da loja física: registros por tipo (Postgres em produção; memória em dev sem banco e na demonstração). */
export interface DadosPorTipo {
  caixa: Caixa;
  fechamento: Fechamento;
  'carro-forte': CarroForte;
  lancamento: Lancamento;
  'despesa-fixa': DespesaFixa;
  fiado: Fiado;
}
export type TipoRegistro = keyof DadosPorTipo;

export interface Registro<T extends TipoRegistro = TipoRegistro> {
  id: string;
  contaId: string;
  loja: string;
  tipo: T;
  /** AAAA-MM-DD (null para cadastros: caixa, despesa fixa). */
  dia: string | null;
  chave: string | null;
  dados: DadosPorTipo[T];
  criadoPor: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface FiltroRegistros {
  lojas?: readonly string[];
  de?: string;
  ate?: string;
}

export interface NovoRegistro<T extends TipoRegistro> {
  id?: string;
  contaId: string;
  loja: string;
  tipo: T;
  dia: string | null;
  chave?: string | null;
  dados: DadosPorTipo[T];
  criadoPor: string | null;
}

export interface RepositorioGestao {
  readonly tipo: 'memoria' | 'postgres';
  listar<T extends TipoRegistro>(contaId: string, tipo: T, f?: FiltroRegistros): Promise<Registro<T>[]>;
  obter<T extends TipoRegistro>(contaId: string, tipo: T, id: string): Promise<Registro<T> | null>;
  /** Insere ou atualiza (pelo id, ou pela chave se vier uma). */
  salvar<T extends TipoRegistro>(r: NovoRegistro<T>): Promise<Registro<T>>;
  remover(contaId: string, id: string): Promise<void>;
}

const dentro = (r: Registro, f?: FiltroRegistros) =>
  (!f?.lojas || f.lojas.includes(r.loja)) && (!f?.de || (r.dia !== null && r.dia >= f.de)) && (!f?.ate || (r.dia !== null && r.dia <= f.ate));

const DATAS = new Set(['criadoEm', 'atualizadoEm']);
export function lerEstadoGestao(json: string): Registro[] {
  return JSON.parse(json, (k, v) => (DATAS.has(k) && typeof v === 'string' ? new Date(v) : v)) as Registro[];
}

export class RepositorioGestaoMemoria implements RepositorioGestao {
  readonly tipo = 'memoria' as const;
  constructor(
    readonly registros: Registro[] = [],
    private readonly aoMudar: (r: Registro[]) => void = () => {},
  ) {}

  async listar<T extends TipoRegistro>(contaId: string, tipo: T, f?: FiltroRegistros) {
    return this.registros
      .filter((r) => r.contaId === contaId && r.tipo === tipo && dentro(r, f))
      .sort((a, b) => (a.dia ?? '').localeCompare(b.dia ?? '') || a.criadoEm.getTime() - b.criadoEm.getTime())
      .map((r) => structuredClone(r)) as Registro<T>[];
  }
  async obter<T extends TipoRegistro>(contaId: string, tipo: T, id: string) {
    const r = this.registros.find((x) => x.contaId === contaId && x.tipo === tipo && x.id === id);
    return r ? (structuredClone(r) as Registro<T>) : null;
  }
  async salvar<T extends TipoRegistro>(n: NovoRegistro<T>) {
    const agora = new Date();
    const atual = this.registros.find((x) => x.contaId === n.contaId && ((n.id && x.id === n.id) || (n.chave && x.chave === n.chave)));
    if (atual) {
      Object.assign(atual, { loja: n.loja, dia: n.dia, chave: n.chave ?? atual.chave, dados: structuredClone(n.dados), atualizadoEm: agora });
      this.aoMudar(this.registros);
      return structuredClone(atual) as Registro<T>;
    }
    const r: Registro<T> = { id: n.id ?? globalThis.crypto.randomUUID(), contaId: n.contaId, loja: n.loja, tipo: n.tipo, dia: n.dia, chave: n.chave ?? null, dados: structuredClone(n.dados), criadoPor: n.criadoPor, criadoEm: agora, atualizadoEm: agora };
    this.registros.push(r as Registro);
    this.aoMudar(this.registros);
    return structuredClone(r);
  }
  async remover(contaId: string, id: string) {
    const i = this.registros.findIndex((x) => x.contaId === contaId && x.id === id);
    if (i >= 0) this.registros.splice(i, 1);
    this.aoMudar(this.registros);
  }
}

type Linha = { id: string; conta_id: string; loja_codigo: string; tipo: TipoRegistro; dia: string | Date | null; chave: string | null; dados: unknown; criado_por: string | null; criado_em: Date; atualizado_em: Date };
const registro = <T extends TipoRegistro>(r: Linha): Registro<T> => ({
  id: r.id,
  contaId: r.conta_id,
  loja: r.loja_codigo,
  tipo: r.tipo as T,
  dia: r.dia === null ? null : typeof r.dia === 'string' ? r.dia.slice(0, 10) : r.dia.toISOString().slice(0, 10),
  chave: r.chave,
  dados: r.dados as DadosPorTipo[T],
  criadoPor: r.criado_por,
  criadoEm: new Date(r.criado_em),
  atualizadoEm: new Date(r.atualizado_em),
});

export class RepositorioGestaoPostgres implements RepositorioGestao {
  readonly tipo = 'postgres' as const;
  constructor(private readonly sql: Sql) {}

  async listar<T extends TipoRegistro>(contaId: string, tipo: T, f?: FiltroRegistros) {
    const rs = await this.sql<Linha[]>`
      select * from gestao_registros
      where conta_id = ${contaId} and tipo = ${tipo}
        ${f?.lojas ? this.sql`and loja_codigo = any(${f.lojas as string[]})` : this.sql``}
        ${f?.de ? this.sql`and dia >= ${f.de}::date` : this.sql``}
        ${f?.ate ? this.sql`and dia <= ${f.ate}::date` : this.sql``}
      order by dia nulls first, criado_em`;
    return rs.map((r) => registro<T>(r));
  }
  async obter<T extends TipoRegistro>(contaId: string, tipo: T, id: string) {
    const [r] = await this.sql<Linha[]>`select * from gestao_registros where conta_id = ${contaId} and tipo = ${tipo} and id = ${id}`;
    return r ? registro<T>(r) : null;
  }
  async salvar<T extends TipoRegistro>(n: NovoRegistro<T>) {
    const dados = this.sql.json(n.dados as unknown as Parameters<Sql['json']>[0]);
    if (n.id) {
      const [r] = await this.sql<Linha[]>`
        update gestao_registros set loja_codigo = ${n.loja}, dia = ${n.dia}::date, chave = coalesce(${n.chave ?? null}, chave), dados = ${dados}, atualizado_em = now()
        where conta_id = ${n.contaId} and id = ${n.id} returning *`;
      if (r) return registro<T>(r);
    }
    const [r] = await this.sql<Linha[]>`
      insert into gestao_registros (conta_id, loja_codigo, tipo, dia, chave, dados, criado_por)
      values (${n.contaId}, ${n.loja}, ${n.tipo}, ${n.dia}::date, ${n.chave ?? null}, ${dados}, ${n.criadoPor})
      on conflict (conta_id, chave) do update set loja_codigo = excluded.loja_codigo, dia = excluded.dia, dados = excluded.dados, atualizado_em = now()
      returning *`;
    return registro<T>(r!);
  }
  async remover(contaId: string, id: string) {
    await this.sql`delete from gestao_registros where conta_id = ${contaId} and id = ${id}`;
  }
}
