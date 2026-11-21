import {
  breakEvenPorConcurso,
  calcularPosicoes,
  conferirBolao,
  diaSP,
  financeiroDoBolao,
  formatarCodigoBolao,
  franquiaDisponivel,
  franquiaUsada,
  inicioDoDiaSP,
  modalidadeConferivel,
  normalizarCodigoLoterica,
  posicaoNaAbertura,
  resumoDoSorteio,
  resumoFinanceiro,
  rotuloFaixa,
  somarDias,
  type BolaoMinha,
  type ColunaLoteca,
  type JogoBolao,
  type PartidaLoteca,
  type ColocacaoPorEscopo,
  type ModalidadeSlug,
  type ResultadoOficial,
} from '@radar/core';
import type { Sql } from '@radar/db';
import type { FonteDadosRaioX, MinhaLotericaRef } from './dados';
import type { FontePostgresRaioX } from './dados-postgres';

/**
 * Fase 3 — "Minha lotérica": Bolões MKP, Financeiro MKP, Conferência MKP e Posição na abertura.
 * Bolões, financeiro e conferência leem do banco; posição na abertura usa as participações
 * (banco ou simulação). Números são estimativas a partir das leituras da vitrine.
 */
export class MinhaIndisponivel extends Error {}

function data(v: Date | string): Date;
function data(v: Date | string | null): Date | null;
function data(v: Date | string | null): Date | null {
  return v === null ? null : v instanceof Date ? v : new Date(v);
}

function sqlDe(fonte: FonteDadosRaioX): Sql {
  // checagem pelo tipo (não por instanceof): no Next a fonte pode ter sido criada noutro pacote (instrumentation)
  const sql = fonte.tipo === 'postgres' ? (fonte as FontePostgresRaioX).sql : undefined;
  if (!sql) throw new MinhaIndisponivel('a "Minha lotérica" precisa do banco (defina DATABASE_URL e grave o seed ou rode o coletor)');
  return sql;
}

/** Uma das lotéricas do dono (`loja` em qualquer forma do código); sem `loja`, a 1ª configurada. */
export async function minhaLoterica(fonte: FonteDadosRaioX, loja?: string | null): Promise<MinhaLotericaRef> {
  const minhas = await fonte.minhasLotericas();
  if (!minhas.length) throw new MinhaIndisponivel('defina RADAR_MINHA_LOTERICA com o código da sua lotérica (ex.: 2894=Coli Loterias)');
  if (!loja) return minhas[0]!;
  const c = normalizarCodigoLoterica(loja);
  const l = minhas.find((m) => m.codigoCaixa === c);
  if (!l) throw new MinhaIndisponivel(`a lotérica ${loja} não está entre as suas (RADAR_MINHA_LOTERICA)`);
  return l;
}

interface LinhaBolao {
  id: number;
  id_caixa: string;
  slug: ModalidadeSlug;
  numero: number;
  sorteio_em: Date | string | null;
  first_seen_at: Date | string;
  jogos: number;
  dezenas: number;
  cotas_total: number;
  cotas_digitais: number | null;
  cotas_disponiveis: number;
  valor_cota: string;
  tarifa_cota: string | null;
  contem_residuo: boolean;
  valor_ultima_cota: string | null;
  sobra_final: number | null;
  estornado: boolean;
  status: string;
  fila: number;
  concurso_id: number;
  pos_brasil: number;
  pos_uf: number;
  pos_cidade: number;
}

async function carregarBoloes(sql: Sql, codigo: string, desde: Date, ate?: Date): Promise<LinhaBolao[]> {
  return sql<LinhaBolao[]>`
    select b.id, b.id_caixa, m.slug, c.numero, c.sorteio_em, b.first_seen_at, b.jogos, b.dezenas, b.cotas_total, b.cotas_digitais,
           b.cotas_disponiveis, b.valor_cota, b.tarifa_cota, b.contem_residuo, b.valor_ultima_cota, b.sobra_final, b.estornado,
           b.status, b.fila, b.concurso_id,
           coalesce(b.pos_entrada_brasil, b.pos_entrada_calc_brasil) as pos_brasil,
           coalesce(b.pos_entrada_uf, b.pos_entrada_calc_uf) as pos_uf,
           coalesce(b.pos_entrada_cidade, b.pos_entrada_calc_cidade) as pos_cidade
    from boloes b
    join lotericas l on l.id = b.loterica_id
    join concursos c on c.id = b.concurso_id
    join modalidades m on m.id = c.modalidade_id
    where l.codigo_caixa = ${codigo}
      and (b.first_seen_at >= ${desde.toISOString()}::timestamptz or b.status = 'a_venda')
      ${ate ? sql`and b.first_seen_at < ${ate.toISOString()}::timestamptz` : sql``}
    order by b.first_seen_at desc`;
}

function paraMinha(b: LinhaBolao): BolaoMinha {
  const sorteio = data(b.sorteio_em);
  return {
    id: String(b.id),
    modalidade: b.slug,
    concurso: b.numero,
    inseridoEm: data(b.first_seen_at),
    diaSorteio: sorteio ? diaSP(sorteio) : null,
    cotasTotal: b.cotas_total,
    cotasDigitais: b.cotas_digitais,
    cotasDisponiveis: b.cotas_disponiveis,
    valorCotaBase: Number(b.valor_cota),
    tarifaPorCotaFonte: b.tarifa_cota === null ? null : Number(b.tarifa_cota),
    contemResiduo: b.contem_residuo,
    valorUltimaCotaBase: b.valor_ultima_cota === null ? null : Number(b.valor_ultima_cota),
    sobraFinal: b.sobra_final,
    estornado: b.estornado,
  };
}

const colocacao = (brasil: number, uf: number, cidade: number): ColocacaoPorEscopo => ({
  brasil: { posicao: brasil, pagina: Math.ceil(brasil / 30) },
  uf: { posicao: uf, pagina: Math.ceil(uf / 30) },
  cidade: { posicao: cidade, pagina: Math.ceil(cidade / 30) },
});

/** Colocação ATUAL dos meus bolões à venda: regra (fila, first_seen_at) sobre os visíveis do concurso. */
async function colocacoesAtuais(sql: Sql, concursos: number[]): Promise<Map<string, ColocacaoPorEscopo>> {
  const r = new Map<string, ColocacaoPorEscopo>();
  if (!concursos.length) return r;
  const visiveis = await sql<{ id: number; codigo_caixa: string; cidade: string; uf: string; fila: number; first_seen_at: Date | string; ordem: number | null }[]>`
    select b.id, l.codigo_caixa, l.cidade, l.uf, b.fila, b.first_seen_at, b.ordem_primeira_leitura as ordem
    from boloes b join lotericas l on l.id = b.loterica_id
    where b.concurso_id = any(${concursos}) and b.status = 'a_venda'`;
  const pos = calcularPosicoes(
    visiveis.map((v) => ({ id: String(v.id), lotericaCodigo: v.codigo_caixa, loterica: { cidade: v.cidade, uf: v.uf }, fila: v.fila, firstSeenAt: data(v.first_seen_at), ordemFonte: v.ordem ?? 0 })),
  );
  for (const [id, p] of pos) r.set(id, p);
  return r;
}

/** Bolões MKP: ativos + os dos últimos `dias` dias, com financeiro, break-even, fila e colocação. */
export async function boloesMkp(fonte: FonteDadosRaioX, o: { dias?: number; loja?: string | null } = {}) {
  const sql = sqlDe(fonte);
  const loterica = await minhaLoterica(fonte, o.loja);
  const agora = fonte.agora();
  const dias = o.dias ?? 7;
  const linhas = await carregarBoloes(sql, loterica.codigoCaixa, inicioDoDiaSP(somarDias(diaSP(agora), -(dias - 1))));
  const minhas = linhas.map(paraMinha);
  // colocação atual por concurso (cada concurso tem a sua vitrine)
  const ativosPorConcurso = [...new Set(linhas.filter((l) => l.status === 'a_venda').map((l) => l.concurso_id))];
  const atuais = new Map<string, ColocacaoPorEscopo>();
  for (const c of ativosPorConcurso) for (const [id, p] of await colocacoesAtuais(sql, [c])) atuais.set(id, p);
  const hoje = diaSP(agora);
  const limite = Number(process.env.RADAR_FRANQUIA_LIMITE ?? 8000);
  const usado = franquiaUsada(
    minhas.map((b) => ({ inseridoEm: b.inseridoEm, cotasTotal: b.cotasTotal, valorCotaBase: b.valorCotaBase, estornado: b.estornado })),
    hoje,
  );
  return {
    loterica,
    dias,
    franquia: { dia: hoje, limite, usado, disponivel: franquiaDisponivel(limite, usado) },
    breakEven: breakEvenPorConcurso(minhas.filter((b) => !b.estornado)),
    linhas: linhas.map((l, i) => {
      const f = financeiroDoBolao(minhas[i]!);
      return {
        id: l.id,
        idCaixa: l.id_caixa,
        modalidade: l.slug,
        concurso: l.numero,
        entradaEm: data(l.first_seen_at),
        formato: formatarCodigoBolao({ jogos: l.jogos, dezenas: l.dezenas, cotas: l.cotas_total }),
        status: l.status,
        estornado: l.estornado,
        cotasTotal: l.cotas_total,
        cotasDigitais: l.cotas_digitais ?? l.cotas_total,
        disponiveis: l.sobra_final ?? l.cotas_disponiveis,
        vendidasInternet: f.vendidasInternet,
        vendidasBalcao: f.vendidasBalcao,
        valorCota: Number(l.valor_cota),
        recebido: f.recebidoInternet + f.recebidoBalcao,
        custo: f.sobra,
        tarifa: f.tarifa,
        comissao: f.comissao,
        lucro: f.lucro,
        fila: l.fila,
        colocacaoEntrada: colocacao(l.pos_brasil, l.pos_uf, l.pos_cidade),
        colocacaoAtual: atuais.get(String(l.id)) ?? null,
      };
    }),
  };
}

/** Financeiro MKP de um período (por data de inserção do bolão). */
export async function financeiroMkp(fonte: FonteDadosRaioX, o: { de?: string; ate?: string; loja?: string | null } = {}) {
  const sql = sqlDe(fonte);
  const loterica = await minhaLoterica(fonte, o.loja);
  const agora = fonte.agora();
  const ate = o.ate ?? diaSP(agora);
  const de = o.de ?? somarDias(ate, -29);
  const linhas = await carregarBoloes(sql, loterica.codigoCaixa, inicioDoDiaSP(de), inicioDoDiaSP(somarDias(ate, 1)));
  const noPeriodo = linhas.filter((l) => diaSP(data(l.first_seen_at)) >= de);
  return { loterica, de, ate, ...resumoFinanceiro(noPeriodo.map(paraMinha)) };
}

/** Conferência MKP: prêmios dos meus bolões com resultado e rateio oficiais. */
export async function conferenciaMkp(fonte: FonteDadosRaioX, o: { dias?: number; loja?: string | null } = {}) {
  const sql = sqlDe(fonte);
  const loterica = await minhaLoterica(fonte, o.loja);
  const agora = fonte.agora();
  const desde = inicioDoDiaSP(somarDias(diaSP(agora), -((o.dias ?? 30) - 1)));
  const linhas = (await carregarBoloes(sql, loterica.codigoCaixa, desde)).filter((l) => !l.estornado && modalidadeConferivel(l.slug));
  const concursos = [...new Set(linhas.map((l) => l.concurso_id))];
  if (!concursos.length) return { loterica, linhas: [], totalPremios: 0, totalLoterica: 0, resultados: 0 };
  const [resultados, rateios, jogos] = await Promise.all([
    sql<{
      concurso_id: number; data_apuracao: string | Date; dezenas: number[]; dezenas2: number[] | null; trevos: number[] | null;
      time_coracao: string | null; mes_sorte: number | null; partidas: PartidaLoteca[] | null; acumulado: boolean; origem: string;
    }[]>`
      select concurso_id, data_apuracao, dezenas, dezenas2, trevos, time_coracao, mes_sorte, partidas, acumulado, origem
      from resultados where concurso_id = any(${concursos})`,
    sql<{ concurso_id: number; faixa: number; descricao: string; acertos: number | null; ganhadores: number; valor_premio: string }[]>`
      select concurso_id, faixa, descricao, acertos, ganhadores, valor_premio from rateios where concurso_id = any(${concursos}) order by faixa`,
    sql<{ bolao_id: number; ordem: number; numeros: number[]; trevos: number[] | null; time_coracao: string | null; mes_sorte: number | null; colunas: unknown }[]>`
      select bolao_id, ordem, numeros, trevos, time_coracao, mes_sorte, colunas
      from bolao_jogos where bolao_id = any(${linhas.map((l) => l.id)}) order by bolao_id, ordem`,
  ]);
  const resPorConcurso = new Map(resultados.map((r) => [r.concurso_id, r]));
  const slugDoBolao = new Map(linhas.map((l) => [l.id, l.slug]));
  const jogosPorBolao = new Map<number, JogoBolao[]>();
  for (const j of jogos) {
    const jogo: JogoBolao = { numeros: j.numeros };
    if (j.trevos?.length) jogo.trevos = j.trevos;
    if (j.time_coracao) jogo.timeCoracao = j.time_coracao;
    if (j.mes_sorte) jogo.mesSorte = j.mes_sorte;
    if (Array.isArray(j.colunas)) {
      if (slugDoBolao.get(j.bolao_id) === 'loteca') jogo.palpites = j.colunas as ColunaLoteca[][];
      else jogo.colunas = j.colunas as number[][];
    }
    jogosPorBolao.set(j.bolao_id, [...(jogosPorBolao.get(j.bolao_id) ?? []), jogo]);
  }
  const saida = [];
  for (const l of linhas) {
    const r = resPorConcurso.get(l.concurso_id);
    const js = jogosPorBolao.get(l.id);
    if (!r || !js?.length) continue;
    const oficial: ResultadoOficial = {
      modalidade: l.slug,
      concurso: l.numero,
      dataApuracao: typeof r.data_apuracao === 'string' ? r.data_apuracao.slice(0, 10) : r.data_apuracao.toISOString().slice(0, 10),
      dezenas: r.dezenas,
      ...(r.dezenas2 ? { dezenas2: r.dezenas2 } : {}),
      ...(r.trevos?.length ? { trevos: r.trevos } : {}),
      ...(r.time_coracao ? { timeCoracao: r.time_coracao } : {}),
      ...(r.mes_sorte ? { mesSorte: r.mes_sorte } : {}),
      ...(r.partidas ? { partidas: r.partidas } : {}),
      acumulado: r.acumulado,
      rateios: rateios.filter((x) => x.concurso_id === l.concurso_id).map((x) => ({ faixa: x.faixa, descricao: x.descricao, acertos: x.acertos, ganhadores: x.ganhadores, valorPremio: Number(x.valor_premio) })),
    };
    const sobradas = l.sobra_final ?? l.cotas_disponiveis;
    const c = conferirBolao(js, oficial, l.cotas_total, sobradas);
    if (!c) continue;
    const dupla = l.slug === 'dupla-sena';
    const faixas = c.apostas.flatMap((a) => a.faixas);
    saida.push({
      id: l.id,
      modalidade: l.slug,
      concurso: l.numero,
      dataApuracao: oficial.dataApuracao,
      dezenas: oficial.dezenas,
      sorteio: resumoDoSorteio(oficial),
      origemResultado: r.origem,
      formato: formatarCodigoBolao({ jogos: l.jogos, dezenas: l.dezenas, cotas: l.cotas_total }),
      melhorAcerto: c.apostas.length ? Math.max(...c.apostas.map((a) => Math.max(a.acertos, a.acertos2 ?? 0))) : null,
      faixas,
      faixasTexto: faixas.map((f) => rotuloFaixa(f, dupla)),
      premioTotal: c.premioTotal,
      premioPorCota: c.premioPorCota,
      cotasTotal: c.cotasTotal,
      cotasSobradas: c.cotasSobradas,
      premioLoterica: c.premioLoterica,
      /** Jogos que não deu para conferir e faixas pendentes (o prêmio acima não as inclui). */
      avisos: [
        ...c.naoConferidos.map((n) => `jogo ${n.ordem + 1}: ${n.motivo}`),
        ...[...new Set(c.apostas.flatMap((a) => a.pendencias ?? []))],
      ],
      jogos: js,
    });
  }
  saida.sort((a, b) => b.premioTotal - a.premioTotal || (a.dataApuracao < b.dataApuracao ? 1 : -1));
  return {
    loterica,
    linhas: saida,
    resultados: resultados.length,
    totalPremios: Math.round(saida.reduce((s, x) => s + x.premioTotal, 0) * 100) / 100,
    totalLoterica: Math.round(saida.reduce((s, x) => s + x.premioLoterica, 0) * 100) / 100,
  };
}

/** Posição na abertura (7/30/90 dias): funciona com o banco ou com a simulação. */
export async function posicaoMinha(fonte: FonteDadosRaioX, o: { dias?: number; loja?: string | null } = {}) {
  const loterica = await minhaLoterica(fonte, o.loja);
  const [aberturas, participacoes, lotericas] = await Promise.all([fonte.aberturas(), fonte.participacoes(), fonte.lotericas()]);
  const dias = o.dias === 7 || o.dias === 90 ? o.dias : 30;
  return { loterica, ...posicaoNaAbertura(loterica, aberturas, participacoes, new Map(lotericas.map((l) => [l.codigoCaixa, l])), { dias, ate: fonte.agora() }) };
}

/** Estorno manual (marcar/desmarcar) de um bolão da MINHA lotérica. */
export async function marcarEstorno(fonte: FonteDadosRaioX, bolaoId: number, estornado: boolean): Promise<boolean> {
  const sql = sqlDe(fonte);
  const minhas = (await fonte.minhasLotericas()).map((l) => l.codigoCaixa);
  if (!minhas.length) throw new MinhaIndisponivel('defina RADAR_MINHA_LOTERICA com o código da sua lotérica');
  return sql.begin(async (tx) => {
    const r = await tx`
      update boloes b set
        estornado = ${estornado},
        estornado_em = case when ${estornado} then now() else null end,
        status = case when ${estornado} then 'estornado'
                      when b.sobra_final is not null then 'encerrado'
                      when b.cotas_disponiveis = 0 then 'esgotado'
                      else 'a_venda' end
      from lotericas l
      where b.id = ${bolaoId} and l.id = b.loterica_id and l.codigo_caixa = any(${minhas}) and b.estornado <> ${estornado}
      returning b.id`;
    if (!r.length) return false;
    await tx`insert into eventos_bolao (bolao_id, tipo, em, quantidade) values (${bolaoId}, 'estorno', now(), ${estornado ? 1 : -1})`;
    return true;
  }) as Promise<boolean>;
}
