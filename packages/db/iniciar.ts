/**
 * O que o container "migrate" roda a cada subida (e termina). Feito para o Docker Manager da Hostinger,
 * que não tem terminal no servidor:
 *   1. aplica as migrações pendentes;
 *   2. garante as chaves VAPID do Web Push (geradas e guardadas no banco se o ambiente não trouxer);
 *   3. dados FICTÍCIOS de demonstração:
 *      - SEED_DEMO=true (e FONTE de teste): grava o histórico simulado se ele ainda não existir;
 *      - FONTE=caixa-* (vitrine real) ou SEED_DEMO=limpar: apaga o seed e a abertura simulada do coletor,
 *        para não misturar com os dados reais (nada que veio da CAIXA é tocado).
 *   O painel avisa "dados simulados" enquanto houver dado fictício ou FONTE de teste.
 *   DATABASE_URL=... pnpm --filter @radar/db iniciar
 */
import { criarDb, criarSql } from './cliente';
import { garantirChavesVapid } from './config-sistema';
import { migrar } from './migrar';
import { limparDadosDeOrigem, semearHistoricoSimulado } from './seed';

export type AcaoDemo = 'semear' | 'limpar' | 'nada';

/** Decide o que fazer com os dados de demonstração a partir de FONTE e SEED_DEMO. */
export function acaoDemo(env: Record<string, string | undefined>): AcaoDemo {
  const fonteReal = (env.FONTE ?? '').trim().toLowerCase().startsWith('caixa');
  const seed = (env.SEED_DEMO ?? '').trim().toLowerCase();
  if (fonteReal || seed === 'limpar') return 'limpar';
  return seed === 'true' || seed === '1' || seed === 'sim' ? 'semear' : 'nada';
}

async function iniciar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('defina DATABASE_URL');
  const sql = criarSql(url, { max: 2 });
  try {
    const aplicadas = await migrar(sql, (m) => console.log(m));
    console.log(`migrações: ${aplicadas.length} nova(s)`);
    const vapid = await garantirChavesVapid(sql);
    console.log(`chaves VAPID: ${vapid.origem === 'ambiente' ? 'do ambiente' : 'guardadas no banco'}`);
    const db = criarDb(sql);
    const acao = acaoDemo(process.env);
    if (acao === 'limpar') {
      const seed = await limparDadosDeOrigem(db, 'seed');
      const sim = await limparDadosDeOrigem(db, 'simulacao');
      console.log(`dados fictícios removidos: ${seed} concurso(s) do seed, ${sim} da abertura simulada`);
    } else if (acao === 'semear') {
      const [r] = await sql<{ existe: boolean }[]>`select exists(select 1 from concursos where origem = 'seed') as existe`;
      if (r?.existe) console.log('seed de demonstração: já existe (nada a fazer)');
      else {
        const t = Date.now();
        const s = await semearHistoricoSimulado(db, { log: console.log });
        console.log(`seed de demonstração gravado em ${((Date.now() - t) / 1000).toFixed(0)} s: ${s.boloes} bolões`);
      }
    }
    console.log('migrate: pronto');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && (process.argv[1].endsWith('iniciar.ts') || process.argv[1].endsWith('iniciar.js'))) {
  iniciar().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
