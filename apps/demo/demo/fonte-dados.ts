import type { FonteDadosRaioX } from '@/lib/dados';

/**
 * Substitui apps/web/lib/fonte-dados.ts na demonstração: a fonte é a simulada, montada no navegador
 * a partir do JSON gerado no build (ver demo/preparar.ts). Nada de banco.
 */
let fonte: FonteDadosRaioX | undefined;

export function fonteDeDados(): FonteDadosRaioX {
  if (!fonte) throw new Error('os dados da demonstração ainda não foram carregados');
  return fonte;
}

export function definirFonteDeDados(f: FonteDadosRaioX | undefined) {
  fonte = f;
}
