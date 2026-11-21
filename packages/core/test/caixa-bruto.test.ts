import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  caminhoDaUrlCaixa,
  concursosNaRespostaCaixa,
  decodificarCodigoBolao,
  FormatoInesperadoError,
  lerDataHoraServidorCaixa,
  lerDataSorteioCaixa,
  normalizarBolao,
  normalizarDetalheBolaoCaixa,
  normalizarPaginaCaixa,
  validarPagina,
} from '../fonte';
import { aplicarLeitura, novoEstadoConcurso } from '../eventos/estado';
import { varrerConcurso } from '../fonte/varredura';
import type { FonteBoloes } from '../fonte/tipos';

const DIR = join(import.meta.dirname, '..', 'fonte', 'fixtures', 'caixa');
const ler = (nome: string) => JSON.parse(readFileSync(join(DIR, nome), 'utf8'));
const pagina = (n: number) => ler(`recuperar-boloes-disponiveis-mega-sena-3089-sao-paulo-pagina-${String(n).padStart(2, '0')}.json`);
const CONSULTA = { modalidade: 'mega-sena' as const, concurso: 3089, pagina: 1 };
const AGORA = new Date('2026-11-21T04:20:12Z');

describe('contrato bruto da CAIXA -> normalizado', () => {
  it('o exemplo real (20,16 / 27,21 / 7,05; 4 apostas de 9 números; 97/100) normaliza certo', () => {
    const b = normalizarBolao(pagina(1).payload.cotas[0]);
    expect(b).toMatchObject({
      idCaixa: 'MjAyNjsxMTs2MzAyOTE2MDI7MTA3OTU7',
      loterica: { codigoCaixa: '990013', nome: 'LOTERICA SORTE GRANDE', cidade: 'SAO PAULO', uf: 'SP' },
      modalidade: 'mega-sena',
      concurso: 3089,
      jogos: 4,
      dezenas: 9,
      cotasTotal: 100,
      cotasDisponiveis: 97,
      cotasDigitais: 100,
      valorCotaBase: 20.16,
      valorCotaExibido: 27.21,
      tarifaPorCotaFonte: 7.05,
      filaFonte: 1,
    });
    expect(b.contemResiduo).toBeUndefined();
  });

  it('codigoBolao é base64 de "ano;mês;número;lote;"', () => {
    expect(decodificarCodigoBolao('MjAyNjsxMTs2MzAyOTE2MDI7MTA3OTU7')).toEqual({ ano: 2026, mes: 11, numero: 630291602, lote: 10795 });
    expect(decodificarCodigoBolao('não é base64 de bolão')).toBeNull();
  });

  it('caminho da API em base64 na URL', () => {
    const url = 'https://www.loteriasonline.caixa.gov.br/silce-servico-rest/rest/v1/' + Buffer.from('boloes/recuperar-boloes-disponiveis').toString('base64') + '/?q=xyz';
    expect(caminhoDaUrlCaixa(url)).toBe('boloes/recuperar-boloes-disponiveis');
    expect(caminhoDaUrlCaixa('https://exemplo.invalid/x')).toBeNull();
  });

  it('datas: sorteio dd/mm/aaaa e dataHoraServidor no horário de SP sem fuso', () => {
    expect(lerDataSorteioCaixa('22/11/2026')).toBe('2026-11-22');
    expect(lerDataHoraServidorCaixa('2026-11-21T01:18:30.949')!.toISOString()).toBe('2026-11-21T04:18:30.949Z');
    expect(lerDataHoraServidorCaixa('lixo')).toBeUndefined();
  });

  it.each([1, 2, 3, 16])('página %i inteira passa no contrato normalizado', (n) => {
    const p = validarPagina(normalizarPaginaCaixa(pagina(n), { ...CONSULTA, pagina: n }, { obtidaEm: AGORA }));
    expect(p.pagina).toBe(n);
    expect(p.totalItens).toBe(480);
    expect(p.totalPaginas).toBe(16);
    expect(p.itens).toHaveLength(30);
    expect(p.ordemDaVitrine).toBe(false); // lista personalizada pela cidade: não é a ordem Brasil
    expect(p.horaServidor).toBeInstanceOf(Date);
  });

  it('páginas 1 a 3: tudo 1ª fila e nenhuma lotérica repetida (como no portal)', () => {
    const itens = [1, 2, 3].flatMap((n) => normalizarPaginaCaixa(pagina(n), { ...CONSULTA, pagina: n }, { obtidaEm: AGORA }).itens);
    expect(new Set(itens.map((b) => b.filaFonte))).toEqual(new Set([1]));
    expect(new Set(itens.map((b) => b.loterica.codigoCaixa)).size).toBe(90);
  });

  it('descarta itens de outro concurso/modalidade da mesma lista', () => {
    const j = structuredClone(pagina(1));
    j.payload.cotas[0].concurso = 3090;
    expect(normalizarPaginaCaixa(j, CONSULTA, { obtidaEm: AGORA }).itens).toHaveLength(29);
  });

  it('concursos presentes na resposta', () => {
    expect(concursosNaRespostaCaixa(pagina(1))).toEqual([
      { modalidade: 'mega-sena', concurso: 3089, dataSorteio: '2026-11-22', sorteioEm: new Date('2026-11-23T00:00:00Z'), premioEstimado: 3_500_000 },
    ]); // horaSorteio "21:00" da fixture (palpite de formato) => sorteio às 21:00 de SP
  });

  it('detalhar-bolao traz os jogos', () => {
    const b = normalizarDetalheBolaoCaixa(ler('detalhar-bolao-exemplo.json'));
    expect(b.idCaixa).toBe('MjAyNjsxMTs2MzAyOTE2MDI7MTA3OTU7');
    expect(b.numeros).toHaveLength(4);
    expect(b.numeros![0]).toEqual([3, 11, 17, 24, 30, 38, 42, 51, 59]);
  });

  it('bolão com resíduo leva o valor da última cota', () => {
    const it0 = { ...pagina(1).payload.cotas[1], contemResiduo: true, vrUltimaCotaSemTarifa: 12.34 };
    expect(normalizarBolao(it0)).toMatchObject({ contemResiduo: true, valorUltimaCotaBase: 12.34 });
  });

  const base = () => structuredClone(pagina(1).payload.cotas[0]);
  it.each([
    ['sem qtdCotaDisponivel', (b: Record<string, unknown>) => delete b.qtdCotaDisponivel],
    ['disponível > total', (b: Record<string, unknown>) => (b.qtdCotaDisponivel = 101)],
    ['digital > total', (b: Record<string, unknown>) => (b.qtdCotaDigital = 150)],
    ['modalidade desconhecida', (b: Record<string, unknown>) => (b.modalidade = 'BINGO')],
    ['valor da cota como texto', (b: Record<string, unknown>) => (b.vrCotaSemTarifa = '20,16')],
    ['sem município', (b: Record<string, unknown>) => delete b.municipio],
    ['sem nome de lotérica', (b: Record<string, unknown>) => ((b.nomeFantasia = ''), (b.nomeRazaoSocial = null))],
  ])('item rejeitado: %s', (_n, estragar) => {
    const b = base();
    estragar(b);
    expect(() => normalizarBolao(b)).toThrow(FormatoInesperadoError);
  });

  it.each([
    ['sem payload', { versao: 'x' }],
    ['cotas não é lista', { payload: { totalRegistros: 1, paginaAtual: 1, cotas: {} } }],
    ['HTML no lugar do JSON', '<html>manutenção</html>'],
  ])('envelope rejeitado: %s', (_n, json) => {
    expect(() => normalizarPaginaCaixa(json, CONSULTA, { obtidaEm: AGORA })).toThrow(FormatoInesperadoError);
  });

  it('pipeline: páginas brutas -> varredura -> eventos, com fila observada', async () => {
    const paginas = new Map([1, 2, 3].map((n) => [n, pagina(n)]));
    const fonte: FonteBoloes = {
      nome: 'bruta',
      concursosAbertos: async () => [],
      contagens: async () => [],
      pagina: async (c) => {
        const j = paginas.get(c.pagina) ?? { payload: { totalRegistros: 90, paginaAtual: c.pagina, ultimaPagina: 3, cotas: [] } };
        return normalizarPaginaCaixa(j, c, { obtidaEm: AGORA });
      },
    };
    const leitura = await varrerConcurso(fonte, { modalidade: 'mega-sena', concurso: 3089 });
    expect(leitura.itens).toHaveLength(90);
    const estado = novoEstadoConcurso({ modalidade: 'mega-sena', concurso: 3089 });
    const r = aplicarLeitura(estado, leitura);
    expect(r.novos).toHaveLength(90);
    expect(r.novos.every((b) => b.filaObservada === 1 && b.filaCalculada === 1 && b.fila === 1)).toBe(true);
    expect(r.novos.every((b) => b.posEntradaObservada === null)).toBe(true);
  });
});
