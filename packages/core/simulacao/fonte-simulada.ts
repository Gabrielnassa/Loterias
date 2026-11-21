import { agregarMercado } from '../mercado/agregar';
import { chaveConcurso } from '../dominio/tipos';
import { diaSP } from '../tempo/fuso';
import type { ConcursoAbertoFonte, ConsultaBoloes, ContagemFonte, FonteBoloes, PaginaBoloes } from '../fonte/tipos';
import { vitrineEm, type AberturaSimulada } from './abertura-simulada';

/**
 * Fonte que responde com a vitrine de aberturas simuladas no instante do relógio informado.
 * Permite rodar o worker inteiro (agendador, varredura, eventos) sem a CAIXA.
 */
export class FonteSimulada implements FonteBoloes {
  readonly nome = 'simulada';
  private readonly sims = new Map<string, AberturaSimulada>();
  requisicoes = 0;

  constructor(
    simulacoes: readonly AberturaSimulada[],
    private readonly relogio: () => Date = () => new Date(),
    private readonly tamanhoPagina = 30,
  ) {
    for (const s of simulacoes) this.sims.set(chaveConcurso(s), s);
  }

  async concursosAbertos(): Promise<ConcursoAbertoFonte[]> {
    const agora = this.relogio().getTime();
    return [...this.sims.values()]
      .filter((s) => agora >= s.t0.getTime() && agora < s.fechaEm.getTime())
      .map((s) => ({
        modalidade: s.modalidade,
        concurso: s.concurso,
        fechaEm: s.fechaEm,
        dataSorteio: diaSP(s.fechaEm),
        // na simulação o sorteio é 1 h depois do fechamento das vendas
        sorteioEm: new Date(s.fechaEm.getTime() + 60 * 60_000),
      }));
  }

  async contagens(): Promise<ContagemFonte[]> {
    const agora = this.relogio();
    return [...this.sims.values()].map((s) => {
      const br = agregarMercado(vitrineEm(s, agora)).find((l) => l.uf === 'BR');
      return {
        modalidade: s.modalidade,
        concurso: s.concurso,
        boloes: br?.boloes ?? 0,
        cotasDisponiveis: br?.cotasDisponiveis ?? 0,
        lotericas: br?.lotericas ?? 0,
        valorAVenda: br?.valorAVenda ?? 0,
      };
    });
  }

  async pagina(consulta: ConsultaBoloes): Promise<PaginaBoloes> {
    this.requisicoes++;
    const agora = this.relogio();
    const sim = this.sims.get(chaveConcurso(consulta));
    let itens = sim ? vitrineEm(sim, agora) : [];
    if (consulta.uf) itens = itens.filter((b) => b.loterica.uf === consulta.uf);
    if (consulta.cidade) itens = itens.filter((b) => b.loterica.cidade === consulta.cidade);
    if (consulta.codigoLoterica) itens = itens.filter((b) => b.loterica.codigoCaixa === consulta.codigoLoterica);
    const inicio = (consulta.pagina - 1) * this.tamanhoPagina;
    return {
      consulta,
      pagina: consulta.pagina,
      tamanhoPagina: this.tamanhoPagina,
      totalItens: itens.length,
      totalPaginas: Math.ceil(itens.length / this.tamanhoPagina),
      itens: itens.slice(inicio, inicio + this.tamanhoPagina),
      ordemDaVitrine: true,
      obtidaEm: agora,
    };
  }
}
