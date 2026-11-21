import { criarDb, criarSql, garantirParticoes, migrar, removerParticoesAntigas } from '@radar/db';
import { Agendador } from './agendador';
import { Coletor } from './coletor';
import { lerConfig } from './config';
import { criarFilaBullmq, criarFilaMemoria, type Fila } from './filas';
import { criarFonte } from './fonte';
import { criarBuscaResultados } from './fontes/resultados-caixa';
import { criarLog } from './log';
import { Relogio } from './relogio';
import { RepositorioMemoria } from './repositorio/memoria';
import { RepositorioPostgres } from './repositorio/postgres';
import type { Repositorio } from './repositorio/tipos';

async function principal() {
  const cfg = lerConfig();
  const { amb } = cfg;
  const log = criarLog(amb.LOG_LEVEL);
  const relogio = new Relogio();
  const finalizar: (() => Promise<unknown> | void)[] = [];

  const sincronizarRelogio = async () => {
    if (!amb.NTP_SERVIDOR) return;
    try {
      const m = await relogio.sincronizar(amb.NTP_SERVIDOR);
      log.info({ ntp: m.servidor, offsetMs: Math.round(m.offsetMs), rttMs: Math.round(m.rttMs) }, 'relógio sincronizado');
    } catch (e) {
      log.warn({ erro: e instanceof Error ? e.message : String(e) }, 'NTP indisponível: usando relógio do sistema');
    }
  };
  await sincronizarRelogio();
  const ntpTimer = setInterval(sincronizarRelogio, amb.NTP_INTERVALO_MIN * 60_000);
  finalizar.push(() => clearInterval(ntpTimer));

  let repo: Repositorio;
  if (amb.REPOSITORIO === 'postgres') {
    const sql = criarSql(amb.DATABASE_URL!);
    finalizar.push(() => sql.end({ timeout: 5 }));
    if (amb.MIGRAR_NA_PARTIDA) await migrar(sql, (m) => log.info(m));
    const manutencao = async () => {
      try {
        const criadas = await garantirParticoes(sql, 8);
        const removidas = await removerParticoesAntigas(sql, 90);
        log.info({ criadas, removidas }, 'partições de snapshots_bolao verificadas');
      } catch (e) {
        log.error({ erro: e instanceof Error ? e.message : String(e) }, 'falha na manutenção de partições');
      }
    };
    await manutencao();
    const manutTimer = setInterval(manutencao, 6 * 3_600_000);
    finalizar.push(() => clearInterval(manutTimer));
    repo = new RepositorioPostgres(criarDb(sql));
  } else {
    repo = new RepositorioMemoria();
  }

  const { fonte, simulacoes } = criarFonte(cfg, relogio);
  if (fonte.fechar) finalizar.push(() => fonte.fechar!());
  for (const s of simulacoes) {
    await repo.salvarConcursos([{ modalidade: s.modalidade, concurso: s.concurso, abreEm: s.t0, fechaEm: s.fechaEm, origem: 'manual' }]);
    log.info({ concurso: `${s.modalidade} ${s.concurso}`, t0: s.t0.toISOString(), boloes: s.boloes.length }, 'abertura SIMULADA cadastrada');
  }

  const buscarResultados = amb.RESULTADOS_CAIXA ?? amb.FONTE.startsWith('caixa');
  const coletor = new Coletor({
    fonte,
    repo,
    relogio,
    log,
    config: cfg.coletor,
    ...(buscarResultados ? { resultados: criarBuscaResultados() } : {}),
    alertar: (a) => log.error({ alerta: a }, 'ALERTA: verificar a fonte'),
  });

  let fila: Fila;
  if (amb.FILA === 'bullmq') {
    const u = new URL(amb.REDIS_URL!);
    const conexao = {
      host: u.hostname,
      port: Number(u.port || 6379),
      ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
      maxRetriesPerRequest: null,
    };
    fila = criarFilaBullmq(conexao, coletor, log, amb.COLETA_CONCORRENCIA);
  } else {
    fila = criarFilaMemoria(coletor, log, amb.COLETA_CONCORRENCIA);
  }
  finalizar.unshift(() => fila.fechar());

  const agendador = new Agendador({
    repo,
    relogio,
    log,
    coleta: cfg.coleta,
    tickMs: amb.AGENDADOR_TICK_MS,
    despachar: (t) => fila.despachar(t),
    ocupado: (t) => fila.ocupado(t),
  });
  agendador.iniciar();
  finalizar.unshift(() => agendador.parar());
  log.info({ fonte: fonte.nome, fila: amb.FILA, repositorio: amb.REPOSITORIO, coleta: cfg.coleta }, 'coletor no ar');

  const status = setInterval(() => log.info({ agendador: agendador.estatisticas, pausadoAte: coletor.pausadoAte || null }, 'status do coletor'), 60_000);
  finalizar.unshift(() => clearInterval(status));

  let saindo = false;
  const sair = async (sinal: string) => {
    if (saindo) return;
    saindo = true;
    log.info({ sinal }, 'encerrando coletor');
    for (const f of finalizar) await f();
    process.exit(0);
  };
  process.on('SIGINT', () => void sair('SIGINT'));
  process.on('SIGTERM', () => void sair('SIGTERM'));
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
