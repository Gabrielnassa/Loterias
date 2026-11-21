import { describe, expect, it } from 'vitest';
import { chanceDoBolao, filtrarBoloesDoSite, linkCaixaLoterica, linkWhatsapp, mensagemPedido, metricasDoSite, normalizarWhatsapp, slugDoNome, slugValido, valorCotaComTarifa, type BolaoDoSite } from '../site/site';

describe('site público: endereço e links', () => {
  it('slug do nome, sem acento; rotas do painel são reservadas', () => {
    expect(slugDoNome('Coli Loterias')).toBe('coli-loterias');
    expect(slugDoNome('  Lotérica Ação & Sorte!! ')).toBe('loterica-acao-sorte');
    expect(slugValido('coli-loterias')).toBe(true);
    expect(slugValido('mercado')).toBe(false);
    expect(slugValido('Coli')).toBe(false);
  });
  it('WhatsApp com DDI e mensagem do pedido; link público da CAIXA', () => {
    expect(normalizarWhatsapp('(11) 99999-0000')).toBe('5511999990000');
    expect(normalizarWhatsapp('+55 11 3333-4444')).toBe('551133334444');
    expect(normalizarWhatsapp('123')).toBeNull();
    const msg = mensagemPedido('Coli Loterias', [{ modalidade: 'Mega-Sena', concurso: 3089, formato: '1J-9D-10C', cotas: 2, valorCota: 27.21 }]);
    expect(msg).toContain('• 2 cotas Mega-Sena 3089 (1J-9D-10C) a R$ 27,21');
    expect(msg).toContain('Total: R$ 54,42');
    expect(linkWhatsapp('5511999990000', 'oi tudo')).toBe('https://wa.me/5511999990000?text=oi%20tudo');
    expect(linkCaixaLoterica('2894')).toBe('https://www.loteriasonline.caixa.gov.br/silce-web/#/bolao-caixa/2894');
    expect(linkCaixaLoterica('2894', 'https://exemplo/x')).toBe('https://exemplo/x');
  });
  it('valor da cota com tarifa = o que o portal mostra (20,16 -> 27,21)', () => {
    expect(valorCotaComTarifa(20.16)).toBe(27.21);
    expect(valorCotaComTarifa(20.16, 7.05)).toBe(27.21);
  });
});

describe('chance do prêmio do bolão', () => {
  it('Mega com 9 números: sena 1 em 595.998 por jogo; 4 jogos ≈ 1 em 149.000', () => {
    expect(chanceDoBolao('mega-sena', 1, 9).principalUmEm).toBe(595_998);
    expect(chanceDoBolao('mega-sena', 4, 9).principalUmEm).toBe(Math.round(595_998.33 / 4));
    expect(chanceDoBolao('mega-sena', 1, 9).descricaoPrincipal).toBe('6 acertos');
    const lf = chanceDoBolao('lotofacil', 10, 16);
    expect(lf.algumPremioUmEm!).toBeLessThan(2); // 16 números: quase sempre algum prêmio em 10 jogos
    expect(chanceDoBolao('loteca', 1, 14).principalUmEm).toBeNull();
  });
});

describe('filtros e métricas', () => {
  const b = (id: string, modalidade: BolaoDoSite['modalidade'], v: number, disp: number, fecha: number): BolaoDoSite => ({ id, modalidade, concurso: 1, jogos: 1, dezenas: 7, cotasTotal: 10, disponiveis: disp, valorCotaBase: v, fechaEm: new Date(fecha) });
  it('só bolões com cota, por loteria, valor máximo com tarifa e ordem', () => {
    const bs = [b('a', 'mega-sena', 30, 3, 2), b('b', 'quina', 10, 5, 1), b('c', 'mega-sena', 5, 0, 1), b('d', 'mega-sena', 15, 1, 3)];
    expect(filtrarBoloesDoSite(bs, {}).map((x) => x.id)).toEqual(['b', 'a', 'd']);
    expect(filtrarBoloesDoSite(bs, { modalidade: 'mega-sena', ordem: 'preco' }).map((x) => x.id)).toEqual(['d', 'a']);
    expect(filtrarBoloesDoSite(bs, { valorMax: 20.5, ordem: 'restam' }).map((x) => x.id)).toEqual(['d', 'b']); // 15 + 5,25 = 20,25 e 10 + 3,50 cabem; 30 + 10,50 não
  });
  it('visitas, pessoas (ids anônimos distintos), cliques e conversão por dia', () => {
    const d = (h: number) => new Date(Date.UTC(2026, 10, 21, h));
    const m = metricasDoSite([
      { em: d(13), tipo: 'visita', visitante: 'x' }, { em: d(14), tipo: 'visita', visitante: 'x' }, { em: d(14), tipo: 'visita', visitante: 'y' },
      { em: d(14), tipo: 'whatsapp', visitante: 'y' }, { em: d(15), tipo: 'caixa', visitante: 'x' }, { em: d(15), tipo: 'carrinho', visitante: 'y' },
    ]);
    expect(m).toMatchObject({ visitas: 3, pessoas: 2, whatsapp: 1, caixa: 1, carrinho: 1 });
    expect(m.conversao).toBeCloseTo(2 / 3);
    expect(m.porDia).toEqual([{ dia: '2026-11-21', visitas: 3, pessoas: 2, whatsapp: 1, caixa: 1, carrinho: 1 }]);
  });
});
