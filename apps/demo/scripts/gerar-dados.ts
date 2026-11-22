/**
 * Dados da demonstração estática, gerados no BUILD (o navegador só lê e calcula):
 * - public/dados/historico.json: histórico simulado (lotéricas fictícias), em JSON compacto;
 * - public/artes/*.png: as 4 artes (Satori) da lotérica de exemplo;
 * - demo/parametros.json: lotéricas, aberturas e sites para as páginas estáticas.
 * DEMO_AGORA (ISO) fixa o instante; DEMO_LOTERICAS, o número de lotéricas (padrão 500).
 */
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { diaSP, isodowDoDia, noDiaSP, slugDoNome, somarDias } from '@radar/core';
import { gerarHistoricoSimulado, serializarHistorico } from '@radar/core/simulacao';
import { renderizarPng, TIPOS_ARTE } from '@/lib/artes';
import { dadosDaArte } from '@/lib/artes-dados';
import { FonteSimuladaRaioX } from '@/lib/dados';

const raiz = process.cwd();
/** Último instante "com movimento" até agora: 45 min depois da abertura (22:30; domingo 12:30). */
function instanteDaDemo(agora: Date): Date {
  for (let i = 0; i < 3; i++) {
    const dia = somarDias(diaSP(agora), -i);
    const t = isodowDoDia(dia) === 7 ? noDiaSP(dia, 12, 30) : noDiaSP(dia, 22, 30);
    if (t.getTime() <= agora.getTime()) return t;
  }
  return agora;
}
const agora = process.env.DEMO_AGORA ? new Date(process.env.DEMO_AGORA) : instanteDaDemo(new Date());
const nLotericas = Number(process.env.DEMO_LOTERICAS ?? 500);
const t = Date.now();
const h = gerarHistoricoSimulado({ ate: agora, semanas: 13, nLotericas });
const json = JSON.stringify(serializarHistorico(h, agora));
// PWA: service worker e ícones do apps/web (instalável também na demonstração)
cpSync(join(raiz, '..', 'web', 'public', 'sw.js'), join(raiz, 'public', 'sw.js'));
cpSync(join(raiz, '..', 'web', 'public', 'icones'), join(raiz, 'public', 'icones'), { recursive: true });
mkdirSync(join(raiz, 'public', 'dados'), { recursive: true });
writeFileSync(join(raiz, 'public', 'dados', 'historico.json'), json);

const demo = h.lotericas[0]!;
writeFileSync(
  join(raiz, 'demo', 'parametros.json'),
  JSON.stringify({ lotericas: h.lotericas.map((l) => l.codigoCaixa), aberturas: h.aberturas.map((a) => a.id), sites: [slugDoNome(demo.nome)] }),
);

// artes com a marca da lotérica de exemplo (os mesmos dados do site de exemplo)
process.env.RADAR_SITES ??= JSON.stringify([{ codigo: demo.codigoCaixa, whatsapp: '5500000000000', instagram: 'exemplo.loterica', endereco: 'Rua de Exemplo, 100 - Santana, São Paulo/SP' }]);
const fonte = new FonteSimuladaRaioX(() => agora, Number.POSITIVE_INFINITY, { historicoPronto: h });
mkdirSync(join(raiz, 'public', 'artes'), { recursive: true });
for (const tipo of TIPOS_ARTE) {
  const { no } = await dadosDaArte(fonte, tipo);
  writeFileSync(join(raiz, 'public', 'artes', `${tipo}.png`), await renderizarPng(no, 540));
}
console.log(
  `demonstração: ${h.lotericas.length} lotéricas, ${h.aberturas.length} aberturas, ${h.participacoes.length} participações; ` +
    `historico.json ${(json.length / 1e6).toFixed(1)} MB; ${((Date.now() - t) / 1000).toFixed(1)} s (agora = ${agora.toISOString()})`,
);
