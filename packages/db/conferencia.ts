import type { ColunaLoteca, JogoBolao, ModalidadeSlug, PartidaLoteca, ResultadoOficial } from '@radar/core';
import type { Sql } from './cliente';

/**
 * Leitura do resultado oficial (com rateio) e dos jogos dos bolões, no formato das regras de
 * conferência do core. Usada pela tela Conferência (web) e pelos alertas de prêmio (worker).
 */
export interface ResultadoDoBanco {
  concursoId: number;
  origem: string;
  /** Sem modalidade e concurso: quem chama completa. */
  resultado: Omit<ResultadoOficial, 'modalidade' | 'concurso'>;
}

export async function lerResultados(sql: Sql, concursoIds: readonly number[]): Promise<Map<number, ResultadoDoBanco>> {
  if (!concursoIds.length) return new Map();
  const [resultados, rateios] = await Promise.all([
    sql<{
      concurso_id: number; data_apuracao: string | Date; dezenas: number[]; dezenas2: number[] | null; trevos: number[] | null;
      time_coracao: string | null; mes_sorte: number | null; partidas: PartidaLoteca[] | null; acumulado: boolean; origem: string;
    }[]>`
      select concurso_id, data_apuracao, dezenas, dezenas2, trevos, time_coracao, mes_sorte, partidas, acumulado, origem
      from resultados where concurso_id = any(${concursoIds as number[]})`,
    sql<{ concurso_id: number; faixa: number; descricao: string; acertos: number | null; ganhadores: number; valor_premio: string }[]>`
      select concurso_id, faixa, descricao, acertos, ganhadores, valor_premio from rateios where concurso_id = any(${concursoIds as number[]}) order by faixa`,
  ]);
  const out = new Map<number, ResultadoDoBanco>();
  for (const r of resultados) {
    out.set(Number(r.concurso_id), {
      concursoId: Number(r.concurso_id),
      origem: r.origem,
      resultado: {
        dataApuracao: typeof r.data_apuracao === 'string' ? r.data_apuracao.slice(0, 10) : r.data_apuracao.toISOString().slice(0, 10),
        dezenas: r.dezenas,
        ...(r.dezenas2 ? { dezenas2: r.dezenas2 } : {}),
        ...(r.trevos?.length ? { trevos: r.trevos } : {}),
        ...(r.time_coracao ? { timeCoracao: r.time_coracao } : {}),
        ...(r.mes_sorte ? { mesSorte: r.mes_sorte } : {}),
        ...(r.partidas ? { partidas: r.partidas } : {}),
        acumulado: r.acumulado,
        rateios: rateios
          .filter((x) => Number(x.concurso_id) === Number(r.concurso_id))
          .map((x) => ({ faixa: x.faixa, descricao: x.descricao, acertos: x.acertos, ganhadores: x.ganhadores, valorPremio: Number(x.valor_premio) })),
      },
    });
  }
  return out;
}

/** Jogos de cada bolão (com trevos, Time do Coração, Mês da Sorte, colunas do Super Sete e palpites da Loteca). */
export async function lerJogos(sql: Sql, boloes: readonly { id: number; slug: ModalidadeSlug }[]): Promise<Map<number, JogoBolao[]>> {
  if (!boloes.length) return new Map();
  const slug = new Map(boloes.map((b) => [Number(b.id), b.slug]));
  const jogos = await sql<{ bolao_id: number; ordem: number; numeros: number[]; trevos: number[] | null; time_coracao: string | null; mes_sorte: number | null; colunas: unknown }[]>`
    select bolao_id, ordem, numeros, trevos, time_coracao, mes_sorte, colunas
    from bolao_jogos where bolao_id = any(${boloes.map((b) => Number(b.id))}) order by bolao_id, ordem`;
  const out = new Map<number, JogoBolao[]>();
  for (const j of jogos) {
    const jogo: JogoBolao = { numeros: j.numeros };
    if (j.trevos?.length) jogo.trevos = j.trevos;
    if (j.time_coracao) jogo.timeCoracao = j.time_coracao;
    if (j.mes_sorte) jogo.mesSorte = j.mes_sorte;
    if (Array.isArray(j.colunas)) {
      if (slug.get(Number(j.bolao_id)) === 'loteca') jogo.palpites = j.colunas as ColunaLoteca[][];
      else jogo.colunas = j.colunas as number[][];
    }
    const id = Number(j.bolao_id);
    out.set(id, [...(out.get(id) ?? []), jogo]);
  }
  return out;
}
