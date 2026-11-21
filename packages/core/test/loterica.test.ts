import { describe, expect, it } from 'vitest';
import { codigoLotericaSeisDigitos, lerLotericasConfiguradas, mesmoCodigoLoterica, normalizarCodigoLoterica } from '../dominio/loterica';
import { buscarLotericas } from '../raio-x/busca';
import { normalizarBolao } from '../fonte';

describe('código CAIXA da lotérica (Coli Loterias: 21.002894-7)', () => {
  it.each(['21.002894-7', '210028947', '002894', '2894', 2894, ' 21.002894-7 ', '21002894'])('%s -> 2894', (c) => {
    expect(normalizarCodigoLoterica(c)).toBe('2894');
  });
  it('formas inválidas são recusadas', () => {
    expect(normalizarCodigoLoterica('')).toBeNull();
    expect(normalizarCodigoLoterica('abc')).toBeNull();
    expect(normalizarCodigoLoterica('000000')).toBeNull();
    expect(normalizarCodigoLoterica('1234567')).toBeNull(); // 7 dígitos: ambíguo
  });
  it('6 dígitos e comparação', () => {
    expect(codigoLotericaSeisDigitos('21.002894-7')).toBe('002894');
    expect(mesmoCodigoLoterica('002894', 2894)).toBe(true);
    expect(mesmoCodigoLoterica('002894', 2895)).toBe(false);
  });
  it('o JSON da API vira a forma canônica', () => {
    const item = {
      codigoBolao: 'x', loterica: '002894', nomeFantasia: 'COLI LOTERIAS', uf: { sigla: 'SP' }, municipio: { nome: 'SAO PAULO' },
      concurso: 1, modalidade: 'MEGA_SENA', qtdCotaTotal: 10, qtdCotaDisponivel: 10, vrCotaSemTarifa: 20, qtdApostas: 1, qtdNumeros: 6,
    };
    expect(normalizarBolao(item).loterica.codigoCaixa).toBe('2894');
    expect(normalizarBolao({ ...item, loterica: 2894 }).loterica.codigoCaixa).toBe('2894');
  });
});

describe('várias lotéricas na configuração (multi-loja)', () => {
  it('lê código ou código=Nome, separados por vírgula ou ponto e vírgula', () => {
    expect(lerLotericasConfiguradas('21.002894-7=Coli Loterias; 2895 = Legal Loterias, 002894')).toEqual([
      { codigoCaixa: '2894', codigoInformado: '21.002894-7', nome: 'Coli Loterias' },
      { codigoCaixa: '2895', codigoInformado: '2895', nome: 'Legal Loterias' },
    ]);
    expect(lerLotericasConfiguradas('2894')).toEqual([{ codigoCaixa: '2894', codigoInformado: '2894' }]);
    expect(lerLotericasConfiguradas('')).toEqual([]);
    expect(() => lerLotericasConfiguradas('Coli')).toThrow(/inválido/);
  });
});

describe('busca pelas três formas do código', () => {
  const ls = [{ codigoCaixa: '2894', nome: 'Coli Loterias', cidade: 'São Paulo', uf: 'SP' }, { codigoCaixa: '28941', nome: 'Outra', cidade: 'Santos', uf: 'SP' }];
  it.each(['21.002894-7', '210028947', '002894', '2894'])('%s acha a Coli primeiro', (q) => {
    expect(buscarLotericas(ls, q)[0]!.nome).toBe('Coli Loterias');
  });
});
