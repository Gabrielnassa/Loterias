import type { ModalidadeSlug } from '../../dominio/modalidades';
import { chaveConcurso } from '../../dominio/tipos';
import type {
  BolaoFonte,
  ConcursoAbertoFonte,
  ConsultaBoloes,
  ContagemFonte,
  FonteBoloes,
  PaginaBoloes,
} from '../tipos';

/**
 * Fonte a partir de fixtures estáticas (arquivos JSON em fonte/fixtures). Os itens já estão
 * na ordem da vitrine e são paginados de 30 em 30. Usada na prova de conceito e em testes.
 */
export interface FixtureConcurso {
  descricao?: string;
  aviso?: string;
  concurso: ConcursoAbertoFonte;
  tamanhoPagina?: number;
  itens: BolaoFonte[];
}

/** Converte o JSON cru (datas como string) para o formato normalizado. */
export function carregarFixture(json: unknown): FixtureConcurso {
  const f = json as FixtureConcurso & { concurso: { fechaEm?: string | Date } };
  return {
    ...f,
    concurso: {
      ...f.concurso,
      ...(f.concurso.fechaEm ? { fechaEm: new Date(f.concurso.fechaEm) } : {}),
    } as ConcursoAbertoFonte,
    itens: f.itens.map((b) => ({
      ...b,
      ...(b.inseridoEmFonte ? { inseridoEmFonte: new Date(b.inseridoEmFonte) } : {}),
    })),
  };
}

export class FonteFixture implements FonteBoloes {
  readonly nome = 'fixture';
  private readonly porConcurso = new Map<string, FixtureConcurso>();

  constructor(
    fixtures: readonly FixtureConcurso[],
    private readonly agora: () => Date = () => new Date(),
  ) {
    for (const f of fixtures) this.porConcurso.set(chaveConcurso(f.concurso), f);
  }

  async concursosAbertos(): Promise<ConcursoAbertoFonte[]> {
    return [...this.porConcurso.values()].map((f) => f.concurso);
  }

  async contagens(): Promise<ContagemFonte[]> {
    return [...this.porConcurso.values()].map((f) => {
      const aVenda = f.itens.filter((b) => b.cotasDisponiveis > 0);
      return {
        modalidade: f.concurso.modalidade,
        concurso: f.concurso.concurso,
        boloes: aVenda.length,
        cotasDisponiveis: aVenda.reduce((s, b) => s + b.cotasDisponiveis, 0),
        lotericas: new Set(aVenda.map((b) => b.loterica.codigoCaixa)).size,
        valorAVenda: Math.round(aVenda.reduce((s, b) => s + b.cotasDisponiveis * b.valorCotaBase, 0) * 100) / 100,
      };
    });
  }

  async pagina(consulta: ConsultaBoloes): Promise<PaginaBoloes> {
    const f = this.porConcurso.get(chaveConcurso(consulta));
    const tamanho = f?.tamanhoPagina ?? 30;
    let itens = (f?.itens ?? []).filter((b) => b.cotasDisponiveis > 0);
    if (consulta.uf) itens = itens.filter((b) => b.loterica.uf === consulta.uf);
    if (consulta.cidade) itens = itens.filter((b) => b.loterica.cidade === consulta.cidade);
    if (consulta.codigoLoterica) itens = itens.filter((b) => b.loterica.codigoCaixa === consulta.codigoLoterica);
    const inicio = (consulta.pagina - 1) * tamanho;
    return {
      consulta,
      pagina: consulta.pagina,
      tamanhoPagina: tamanho,
      totalItens: itens.length,
      totalPaginas: Math.ceil(itens.length / tamanho),
      itens: itens.slice(inicio, inicio + tamanho),
      ordemDaVitrine: true,
      obtidaEm: this.agora(),
    };
  }

  modalidades(): ModalidadeSlug[] {
    return [...new Set([...this.porConcurso.values()].map((f) => f.concurso.modalidade))];
  }
}
