/**
 * Observa uma abertura REAL e grava tudo num arquivo JSONL para decidirmos a estratégia de leitura.
 *
 *   pnpm observar-abertura -- --modalidade mega-sena --t0 2026-11-22T11:45
 *   pnpm observar-abertura -- --modalidade lotofacil --concurso 3840 --t0 2026-11-26T21:45 --duracao-min 61
 *
 * Opções: --modalidade (obrigatória), --concurso (se omitido, detecta o concurso novo), --t0 (horário
 * de São Paulo; default: próximo 21:45, ou 11:45 se for domingo), --duracao-min (default 31),
 * --intervalo-s (default 5), --max-paginas (default 200), --saida (default observacoes/...jsonl).
 * Fonte: FONTE=caixa-navegador (default; precisa da sessão preparada por uma pessoa) ou caixa-links
 * ou simulada (para testar o script: abertura simulada daqui a ~90 s).
 */
import { diaSP, ehModalidade, horarioSP, horaSP, somarDias, t0Padrao, type FonteBoloes } from '@radar/core';
import { lerConfig } from './config';
import { criarFonte, sessaoDaConfig } from './fonte';
import { FonteCaixaNavegador, type EstadoSessao } from './fontes/caixa-navegador';
import { observarAbertura } from './observador';
import { Relogio } from './relogio';

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function lerT0(v: string | undefined, agora: Date): Date {
  if (v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(v);
    if (!m) throw new Error(`--t0 inválido: ${v} (use AAAA-MM-DDTHH:MM, horário de São Paulo)`);
    return horarioSP(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
  }
  const hoje = t0Padrao(diaSP(agora));
  return hoje.getTime() > agora.getTime() ? hoje : t0Padrao(somarDias(diaSP(agora), 1));
}

async function principal() {
  const modalidade = arg('modalidade');
  if (!modalidade || !ehModalidade(modalidade)) throw new Error('informe --modalidade (ex.: mega-sena, lotofacil, quina)');
  const fonteEscolhida = process.env.FONTE ?? 'caixa-navegador';
  const cfg = lerConfig({ ...process.env, FONTE: fonteEscolhida, FILA: 'memoria', REPOSITORIO: 'memoria' });
  const relogio = new Relogio();
  try {
    const m = await relogio.sincronizar(cfg.amb.NTP_SERVIDOR);
    console.log(`relógio: NTP ${m.servidor}, desvio ${Math.round(m.offsetMs)} ms`);
  } catch {
    console.log('relógio: NTP indisponível, usando o do sistema');
  }

  let fonte: FonteBoloes;
  let t0 = lerT0(arg('t0'), relogio.agora());
  let concurso = arg('concurso') ? Number(arg('concurso')) : undefined;
  if (fonteEscolhida === 'caixa-navegador') {
    // sem cache da 1ª página: o concurso novo precisa aparecer assim que abrir
    fonte = new FonteCaixaNavegador({
      baseUrl: cfg.amb.CAIXA_BASE_URL_NAVEGADOR,
      estadoSessao: sessaoDaConfig(cfg.amb) as EstadoSessao,
      contaDedicada: cfg.amb.CAIXA_CONTA_DEDICADA,
      headless: cfg.amb.CAIXA_HEADLESS,
      intervaloMinimoMs: cfg.amb.CAIXA_INTERVALO_MS,
      timeoutMs: cfg.amb.CAIXA_TIMEOUT_MS,
      modalidades: [modalidade],
      cacheListaMs: 0,
      agora: () => relogio.agora(),
      log: (msg) => console.log(`[navegador] ${msg}`),
    });
  } else {
    const criada = criarFonte(cfg, relogio);
    fonte = criada.fonte;
    const sim = criada.simulacoes[0];
    if (sim) {
      t0 = sim.t0;
      concurso = sim.concurso;
    }
  }
  const saida = arg('saida') ?? `observacoes/abertura-${modalidade}-${diaSP(t0)}-${horaSP(t0).slice(0, 5).replace(':', 'h')}.jsonl`;
  console.log(`observando ${modalidade}${concurso ? ` ${concurso}` : ' (concurso detectado na abertura)'} — T0 ${diaSP(t0)} ${horaSP(t0)} — arquivo ${saida}`);
  const resumo = await observarAbertura({
    fonte,
    modalidade,
    ...(concurso ? { concurso } : {}),
    t0,
    duracaoMs: Number(arg('duracao-min') ?? 31) * 60_000,
    intervaloMs: Number(arg('intervalo-s') ?? 5) * 1000,
    maxPaginas: Number(arg('max-paginas') ?? 200),
    saida,
    agora: () => relogio.agora(),
    log: (msg) => console.log(msg),
  }).finally(() => fonte.fechar?.());
  console.log('\nRESUMO');
  console.log(JSON.stringify(resumo, null, 2));
  if (resumo.passouDoIntervaloEmS !== null) {
    console.log(`\nA leitura completa passou de ${Number(arg('intervalo-s') ?? 5)} s a T0 + ${Math.round(resumo.passouDoIntervaloEmS)} s, com ${resumo.paginasQuandoPassou} páginas.`);
  }
}

principal().catch((e) => {
  console.error(`${e?.name ?? 'Erro'}: ${e?.message ?? e}`);
  process.exit(1);
});
