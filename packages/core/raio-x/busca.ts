import type { LotericaRef } from '../dominio/tipos';
import { normalizarTexto } from '../regras/posicao';

/**
 * Busca de lotérica por nome, cidade, UF ou código (sem acento, sem caixa). Ordem:
 * código exato > código começando pelo termo > nome com o termo inteiro > todas as palavras em
 * nome/cidade/UF. Empate: nome. (No Postgres, a mesma busca usa o índice de trigramas.)
 */
export function buscarLotericas(lotericas: readonly LotericaRef[], termo: string, limite = 20): LotericaRef[] {
  const t = normalizarTexto(termo);
  if (!t) return [];
  const digitos = t.replace(/\D/g, '');
  const palavras = t.split(' ').filter(Boolean);
  const pontuadas: { l: LotericaRef; p: number }[] = [];
  for (const l of lotericas) {
    const nome = normalizarTexto(l.nome);
    const tudo = `${nome} ${normalizarTexto(l.cidade)} ${normalizarTexto(l.uf)} ${l.codigoCaixa}`;
    let p = 0;
    if (digitos && digitos === t.replace(/[\s.\-/]/g, '') && l.codigoCaixa === digitos) p = 100;
    else if (digitos.length >= 3 && l.codigoCaixa.startsWith(digitos)) p = 80;
    else if (nome.includes(t)) p = nome.startsWith(t) || nome.includes(` ${t}`) ? 65 : 60;
    else if (palavras.every((w) => tudo.includes(w))) p = 40;
    if (p > 0) pontuadas.push({ l, p });
  }
  return pontuadas
    .sort((a, b) => b.p - a.p || a.l.nome.localeCompare(b.l.nome, 'pt-BR') || a.l.cidade.localeCompare(b.l.cidade, 'pt-BR'))
    .slice(0, limite)
    .map((x) => x.l);
}
