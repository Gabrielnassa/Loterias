import { melhorMarcacao, probabilidadesLoteca, tabelaDeMarcacoes, type JogoLoteca } from '@radar/core';

/** Grade de exemplo: os 14 jogos REAIS do concurso 1.283 (API oficial), sem odds. */
export const GRADE_EXEMPLO = [
  'SINGAPURA x BRASIL', 'GIBRALTAR x MALTA', 'ALEMANHA x HOLANDA', 'GRECIA x SERVIA', 'MACEDONIA DO NORTE x ESLOVENIA',
  'SUICA x ESCOCIA', 'DINAMARCA x NORUEGA', 'PAIS DE GALES x PORTUGAL', 'BOSNIA HERZEGOVINA x ROMENIA', 'HUNGRIA x IRLANDA DO NORTE',
  'ISRAEL x AUSTRIA', 'POLONIA x SUECIA', 'UCRANIA x GEORGIA', 'QUENIA x AFRICA DO SUL',
].join('\n');

/**
 * Lê a grade: uma linha por jogo, "Time A x Time B; odd1; oddX; odd2" (odds opcionais, decimais com
 * vírgula ou ponto) ou "Time A x Time B; elo=1650; elo=1500" para o modelo de força.
 */
export function lerGrade(texto: string): JogoLoteca[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 14)
    .map((l) => {
      const [jogo, ...resto] = l.split(';').map((x) => x.trim());
      const [time1, time2] = (jogo ?? '').split(/\s+x\s+/i);
      const nums = resto.map((x) => Number(x.replace(/^elo=/i, '').replace(',', '.')));
      const elos = resto.length === 2 && resto.every((x) => /^elo=/i.test(x));
      const j: JogoLoteca = { time1: time1 ?? '', time2: time2 ?? '' };
      if (elos) [j.elo1, j.elo2] = nums as [number, number];
      else if (nums.length === 3 && nums.every((n) => n > 1)) j.odds = nums as [number, number, number];
      return j;
    });
}

export function analisarLoteca(texto: string, duplos?: number, triplos?: number) {
  const jogos = lerGrade(texto);
  const probs = jogos.map(probabilidadesLoteca);
  const tabela = jogos.length === 14 ? tabelaDeMarcacoes(probs) : [];
  const escolhida = jogos.length === 14 && duplos !== undefined && triplos !== undefined ? melhorMarcacao(probs, duplos, triplos) : (tabela.find((t) => t.duplos === 3 && t.triplos === 0) ?? null);
  return { jogos, probs, tabela, escolhida };
}
