import { describe, expect, it } from 'vitest';
import type { LotericaRef } from '../dominio/tipos';
import { listasEliteTop, referenciaDaManha, type BolaoParaElite } from '../raio-x/elite';
import type { AberturaInfo } from '../raio-x/semanal';
import { horarioSP, t0Padrao, somarDias } from '../tempo/fuso';

const L = (c: string): LotericaRef => ({ codigoCaixa: c, nome: `Lotérica ${c}`, cidade: 'São Paulo', uf: 'SP' });
const lotericas = new Map(['A', 'B', 'C', 'D'].map((c) => [c, L(c)]));
// 8 noites: 14/11 a 21/11 (o T0 de domingo é 11:45)
const dias = Array.from({ length: 8 }, (_, i) => somarDias('2026-11-14', i));
const aberturas: AberturaInfo[] = dias.flatMap((d, i) => [
  { id: `lotofacil-${100 + i}`, modalidade: 'lotofacil' as const, t0: t0Padrao(d) },
  { id: `mega-sena-${200 + i}`, modalidade: 'mega-sena' as const, t0: t0Padrao(d) },
  { id: `loteca-${300 + i}`, modalidade: 'loteca' as const, t0: t0Padrao(d) },
]);
const bolao = (codigo: string, i: number, mod: 'lotofacil' | 'mega-sena' | 'loteca', minutos: number, valor = 100): BolaoParaElite => ({
  lotericaCodigo: codigo, aberturaId: `${mod}-${(mod === 'lotofacil' ? 100 : mod === 'mega-sena' ? 200 : 300) + i}`, modalidade: mod === 'loteca' ? 'loteca' : mod,
  entrouEm: new Date(t0Padrao(dias[i]!).getTime() + minutos * 60_000), valor,
});

describe('listas Elite e Top do Raio-X', () => {
  const agora = horarioSP(2026, 11, 22, 9, 0); // domingo de manhã: a noite de 22/11 ainda não aconteceu
  const boloes: BolaoParaElite[] = [];
  for (let i = 1; i <= 7; i++) {
    boloes.push(bolao('A', i, 'mega-sena', 1), bolao('A', i, 'mega-sena', 2), bolao('A', i, 'lotofacil', 3)); // todas as noites, 2 filas na Mega
    if (i % 2 === 1) boloes.push(bolao('B', i, 'lotofacil', 90)); // 4 noites (1, 3, 5, 7), dentro das 2 h
    if (i <= 3) boloes.push(bolao('C', i, 'lotofacil', 150)); // depois das 2 h: não conta
    boloes.push(bolao('D', i, 'loteca', 5)); // só Loteca: não conta
  }
  // D usou 90% da franquia (R$ 8.000) antes da abertura em 4 noites: conta com *
  for (const i of [2, 4, 6, 7]) boloes.push({ lotericaCodigo: 'D', aberturaId: `mega-sena-${200 + i}`, modalidade: 'mega-sena', entrouEm: new Date(t0Padrao(dias[i]!).getTime() - 3 * 3_600_000), valor: 7300 });
  const r = listasEliteTop({ aberturas, boloes, lotericas, agora });

  it('as últimas 7 noites encerradas até as 06:00 de hoje, sem a Loteca', () => {
    expect(r.referencia).toEqual(horarioSP(2026, 11, 22, 6, 0));
    expect(r.noites.map((n) => n.dia)).toEqual(dias.slice(1).reverse());
    expect(r.noites[0]!.aberturas.some((a) => a.startsWith('loteca'))).toBe(false);
    expect(referenciaDaManha(horarioSP(2026, 11, 22, 5, 0))).toEqual(horarioSP(2026, 11, 21, 6, 0));
  });
  it('Elite = todas as 7; Top = pelo menos 4; franquia usada antes conta com *', () => {
    expect(r.elite.map((l) => l.loterica.codigoCaixa)).toEqual(['A']);
    expect(r.top.map((l) => l.loterica.codigoCaixa).sort()).toEqual(['A', 'B', 'D']);
    const d = r.top.find((l) => l.loterica.codigoCaixa === 'D')!;
    expect(d.noites.filter((n) => n.porFranquia)).toHaveLength(4);
    expect(d.presencas).toBe(4);
  });
  it('fila média por modalidade e franquia média que resta', () => {
    const a = r.elite[0]!;
    expect(a.filaMedia).toEqual({ 'mega-sena': 2, lotofacil: 1 });
    expect(a.limiteEstimado).toBe(8000);
    expect(a.franquiaMediaRestante).toBe(8000 - 300);
    const d = r.top.find((l) => l.loterica.codigoCaixa === 'D')!;
    expect(d.franquiaMediaRestante).toBeLessThan(8000); // usou 7.300 em 4 das 7 noites
  });
});
