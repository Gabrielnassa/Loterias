/**
 * Prepara, COM UMA PESSOA NO TECLADO, a sessão de navegador usada pelo adaptador caixa-navegador.
 *
 *   pnpm --filter @radar/worker caixa:preparar-sessao [caminho-do-arquivo]
 *
 * Abre um Chromium com janela (precisa de tela: rode no seu computador, ou no VPS com xvfb + VNC).
 * Você mesmo responde "Você tem mais de 18 anos?" e, SE o dono do produto decidir usar uma conta
 * dedicada da empresa, faz o login. Nunca use a conta pessoal de alguém. Ao terminar, volte aqui
 * e tecle Enter: os cookies/armazenamento da sessão são salvos no arquivo (fora do git).
 * O coletor só reutiliza esse arquivo; ele nunca responde a pergunta nem faz login sozinho.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';

async function preparar() {
  const destino = resolve(process.argv[2] ?? process.env.CAIXA_SESSAO ?? '.sessao-caixa/estado.json');
  const base = process.env.CAIXA_BASE_URL_NAVEGADOR ?? 'https://www.loteriasonline.caixa.gov.br/silce-web/';
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await ctx.newPage();
  await page.goto(new URL('#/home', base).toString());
  console.log('\nJanela aberta. No navegador:');
  console.log('  1. Responda você mesmo a pergunta de idade/termos.');
  console.log('  2. (Opcional, só com decisão do dono do produto) faça login com a conta DEDICADA da empresa.');
  console.log('  3. Abra a área de bolões e confira que a lista aparece.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('\nQuando terminar, tecle Enter aqui para salvar a sessão... ');
  rl.close();
  mkdirSync(dirname(destino), { recursive: true });
  await ctx.storageState({ path: destino });
  await browser.close();
  console.log(`\nSessão salva em ${destino}. Use CAIXA_SESSAO=${destino} FONTE=caixa-navegador.`);
  console.log('Este arquivo contém cookies de sessão: não versione e não compartilhe.');
}

preparar().catch((e) => {
  console.error(e);
  process.exit(1);
});
