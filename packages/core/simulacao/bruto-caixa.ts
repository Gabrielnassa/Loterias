import { horaSP, diaSP, partesSP } from '../tempo/fuso';
import { MODALIDADE_PARA_CAIXA } from '../fonte/adaptadores/caixa-bruto';
import { tarifaPorCota } from '../regras/financeiro';
import type { BolaoFonte } from '../fonte/tipos';

/**
 * Gera JSON no FORMATO BRUTO da CAIXA (estrutura observada em 21/11/2026) a partir de bolões
 * normalizados. Usado nas fixtures e no portal falso dos testes do adaptador de navegador.
 * Valores de campos cuja semântica não foi confirmada (numeroUF, ids de município, tipoConcurso,
 * idModalidade, horaSorteio, diaSorteio) são PALPITES plausíveis, marcados na doc das fixtures.
 */

const UF: Record<string, { id: number; nome: string }> = {
  SP: { id: 35, nome: 'SAO PAULO' },
  RJ: { id: 33, nome: 'RIO DE JANEIRO' },
  MG: { id: 31, nome: 'MINAS GERAIS' },
  PR: { id: 41, nome: 'PARANA' },
  BA: { id: 29, nome: 'BAHIA' },
  RS: { id: 43, nome: 'RIO GRANDE DO SUL' },
  PE: { id: 26, nome: 'PERNAMBUCO' },
};

/** Códigos IBGE (palpite: o portal parece usar codigoUF + numero + dígito). */
const MUNICIPIO_IBGE: Record<string, number> = {
  'SAO PAULO': 3550308,
  CAMPINAS: 3509502,
  SANTOS: 3548500,
  'RIBEIRAO PRETO': 3543402,
  'RIO DE JANEIRO': 3304557,
  NITEROI: 3303302,
  'BELO HORIZONTE': 3106200,
  UBERLANDIA: 3170206,
  CURITIBA: 4106902,
  SALVADOR: 2927408,
  'PORTO ALEGRE': 4314902,
  RECIFE: 2611606,
};

const ID_MODALIDADE: Record<string, number> = {
  MEGA_SENA: 1, LOTOFACIL: 2, QUINA: 3, LOTOMANIA: 4, DUPLA_SENA: 5,
  TIMEMANIA: 6, DIA_DE_SORTE: 7, SUPER_SETE: 8, MAIS_MILIONARIA: 9, LOTECA: 10,
};

const DIAS = ['', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO', 'DOMINGO'];

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/** "2026;11;630291602;10795;" em base64. */
export function codigoBolaoCaixa(ano: number, mes: number, numero: number, lote: number): string {
  return Buffer.from(`${ano};${mes};${numero};${lote};`, 'utf8').toString('base64');
}

export interface ExtrasBruto {
  fila: number;
  sorteioEm: Date;
  premioEstimado?: number;
}

export function paraItemBrutoCaixa(b: BolaoFonte, x: ExtrasBruto): Record<string, unknown> {
  const cidade = semAcento(b.loterica.cidade);
  const uf = UF[b.loterica.uf] ?? { id: 0, nome: b.loterica.uf };
  const ibge = MUNICIPIO_IBGE[cidade] ?? 0;
  const tarifa = tarifaPorCota(b.valorCotaBase);
  const ultima = b.valorUltimaCotaBase ?? b.valorCotaBase;
  const tarifaUltima = tarifaPorCota(ultima);
  const p = partesSP(x.sorteioEm);
  const modalidade = MODALIDADE_PARA_CAIXA[b.modalidade];
  return {
    index: x.fila,
    codigoBolao: b.idCaixa,
    qtdCotaDigital: b.cotasDigitais ?? b.cotasTotal,
    qtdCotaTotal: b.cotasTotal,
    qtdCotaDisponivel: b.cotasDisponiveis,
    loterica: Number(b.loterica.codigoCaixa),
    nomeFantasia: semAcento(b.loterica.nome),
    nomeRazaoSocial: `${semAcento(b.loterica.nome)} LTDA`,
    numeroUF: uf.id,
    uf: { sigla: b.loterica.uf, id: uf.id, nome: uf.nome },
    idMunicipio: ibge,
    municipio: {
      id: { codigoUF: Math.floor(ibge / 100000), numero: Math.floor(ibge / 10) % 10000, digitoVerificador: ibge % 10 },
      uf: b.loterica.uf,
      nome: cidade,
    },
    concurso: b.concurso,
    tipoConcurso: 1,
    idModalidade: ID_MODALIDADE[modalidade] ?? 0,
    modalidade,
    dataSorteio: `${String(p.dia).padStart(2, '0')}/${String(p.mes).padStart(2, '0')}/${p.ano}`,
    horaSorteio: horaSP(x.sorteioEm).slice(0, 5),
    diaSorteio: DIAS[p.isodow],
    vrPremioEstimado: x.premioEstimado ?? 0,
    vrCotaSemTarifa: b.valorCotaBase,
    vrCotaComTarifa: Math.round((b.valorCotaBase + tarifa) * 100) / 100,
    valorTarifaServico: tarifa,
    vrUltimaCotaSemTarifa: ultima,
    vrUltimaCotaComTarifa: Math.round((ultima + tarifaUltima) * 100) / 100,
    vrTarifaServicoUltimaCota: tarifaUltima,
    qtdApostas: b.jogos,
    qtdNumeros: b.dezenas,
    qtdTrevos: b.trevos ?? 0,
    qtdSimplesLoteca: 0,
    qtdDuplosLoteca: 0,
    qtdTriplosLoteca: 0,
    contemResiduo: b.contemResiduo ?? false,
    lotericaFavorita: false,
  };
}

/** dataHoraServidor no horário de SP sem fuso, como o portal devolve. */
export function dataHoraServidorCaixa(d: Date): string {
  const ms = String(d.getTime() % 1000).padStart(3, '0');
  return `${diaSP(d)}T${horaSP(d)}.${ms}`;
}

export function respostaBoloesCaixa(
  itens: Record<string, unknown>[],
  o: { pagina: number; totalRegistros: number; tamanhoPagina?: number; agora: Date; versao?: string },
): Record<string, unknown> {
  const tam = o.tamanhoPagina ?? 30;
  const valores = itens.map((i) => i.vrCotaSemTarifa as number);
  return {
    versao: o.versao ?? '2.99.10.43',
    dataHoraServidor: dataHoraServidorCaixa(o.agora),
    payload: {
      totalRegistros: o.totalRegistros,
      paginaAtual: o.pagina,
      ultimaPagina: Math.max(1, Math.ceil(o.totalRegistros / tam)),
      valorMenorCota: valores.length ? Math.min(...valores) : 0,
      contemResiduo: itens.some((i) => i.contemResiduo === true),
      cotas: itens,
    },
  };
}
