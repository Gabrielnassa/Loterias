import { normalizarCodigoLoterica } from '../dominio/loterica';
import type { LotericaRef } from '../dominio/tipos';
import { normalizarTexto } from '../regras/posicao';

/**
 * Busca de lotérica por nome, cidade, UF ou código (sem acento, sem caixa; o código aceita as formas
 * 21.002894-7, 210028947, 002894 e 2894). Ordem:
 * código exato > código começando pelo termo > nome com o termo inteiro > todas as palavras em
 * nome/cidade/UF. Empate: nome. (No Postgres, a mesma busca usa o índice de trigramas.)
 */
export function buscarLotericas(lotericas: readonly LotericaRef[], termo: string, limite = 20): LotericaRef[] {
  const t = normalizarTexto(termo);
  if (!t) return [];
  const digitos = t.replace(/\D/g, '');
  const soCodigo = /^[\d\s.\-/]+$/.test(t);
  const canonico = soCodigo ? normalizarCodigoLoterica(t) : null;
  const palavras = t.split(' ').filter(Boolean);
  const pontuadas: { l: LotericaRef; p: number }[] = [];
  for (const l of lotericas) {
    const nome = normalizarTexto(l.nome);
    const tudo = `${nome} ${normalizarTexto(l.cidade)} ${normalizarTexto(l.uf)} ${l.codigoCaixa}`;
    let p = 0;
    if (soCodigo && (l.codigoCaixa === digitos || (canonico !== null && normalizarCodigoLoterica(l.codigoCaixa) === canonico))) p = 100;
    else if (soCodigo && digitos.length >= 3 && l.codigoCaixa.startsWith(digitos)) p = 80;
    else if (nome.includes(t)) p = nome.startsWith(t) || nome.includes(` ${t}`) ? 65 : 60;
    else if (palavras.every((w) => tudo.includes(w))) p = 40;
    if (p > 0) pontuadas.push({ l, p });
  }
  return pontuadas
    .sort((a, b) => b.p - a.p || a.l.nome.localeCompare(b.l.nome, 'pt-BR') || a.l.cidade.localeCompare(b.l.cidade, 'pt-BR'))
    .slice(0, limite)
    .map((x) => x.l);
}
