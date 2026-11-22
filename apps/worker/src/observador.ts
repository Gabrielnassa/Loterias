import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { BloqueadoPelaFonteError, decodificarCodigoBolao, horaSP, planejarLeitura, varrerConcurso, type ConcursoRef, type FonteBoloes, type PaginaBoloes } from '@radar/core';

/**
 * Observação de uma abertura REAL, para decidir a estratégia de leitura com dados (etapa C).
 * Faz leituras completas do concurso novo de T0 − 1 min até T0 + duração, uma atrás da outra no
 * ritmo pedido, e grava em JSONL (uma linha por evento, à prova de queda):
 *   {tipo:'pagina'}   cada página lida: horário de início/fim, duração, itens, filas, bolões novos
 *   {tipo:'leitura'}  cada leitura completa: duração, páginas, itens, novos, 1ª fila, atraso do slot
 *   {tipo:'resumo'}   no fim: quando a leitura completa passou do intervalo, páginas máximas etc.
 */
export interface OpcoesObservacao {
  fonte: FonteBoloes;
  modalidade: ConcursoRef['modalidade'];
  /** Número do concurso novo; se omitido, detecta pelo maior concurso aberto da modalidade. */
  concurso?: number;
  t0: Date;
  /** Quanto tempo observar depois de T0 (default 31 min: cobre a janela de participação). */
  duracaoMs?: number;
  /** Intervalo desejado entre o início de leituras (default 5 s). */
  intervaloMs?: number;
  maxPaginas?: number;
  saida: string;
  agora?: () => Date;
  dormir?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

export interface ResumoObservacao {
  tipo: 'resumo';
  modalidade: string;
  concurso: number | null;
  t0: string;
  leituras: number;
  leiturasComErro: number;
  paginasMax: number;
  boloesMax: number;
  duracaoMediaMs: number | null;
  duracaoP95Ms: number | null;
  leiturasAcimaDoIntervalo: number;
  /** Segundos depois de T0 em que a leitura completa passou do intervalo pela 1ª vez. */
  passouDoIntervaloEmS: number | null;
  /** Páginas da leitura nesse momento. */
  paginasQuandoPassou: number | null;
  primeiroBolaoEmS: number | null;
}

function p95(v: number[]): number | null {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor(o.length * 0.95))]!;
}

export async function observarAbertura(o: OpcoesObservacao): Promise<ResumoObservacao> {
  const agora = o.agora ?? (() => new Date());
  const dormir = o.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = o.log ?? (() => {});
  const intervalo = o.intervaloMs ?? 5000;
  const inicio = o.t0.getTime() - 60_000;
  const fim = o.t0.getTime() + (o.duracaoMs ?? 31 * 60_000);
  mkdirSync(dirname(o.saida), { recursive: true });
  const gravar = (linha: Record<string, unknown>) => appendFileSync(o.saida, JSON.stringify(linha) + '\n');

  gravar({ tipo: 'inicio', modalidade: o.modalidade, concurso: o.concurso ?? null, t0: o.t0.toISOString(), intervaloMs: intervalo, fonte: o.fonte.nome, em: agora().toISOString() });
  const espera = inicio - agora().getTime();
  if (espera > 0) {
    log(`aguardando T0 − 1 min (${horaSP(new Date(inicio))}), faltam ${Math.round(espera / 1000)} s`);
    await dormir(espera);
  }

  let concurso = o.concurso ?? null;
  const vistos = new Set<string>();
  const duracoes: number[] = [];
  let n = 0;
  let erros = 0;
  let acima = 0;
  let paginasMax = 0;
  let boloesMax = 0;
  let passouEm: number | null = null;
  let paginasQuandoPassou: number | null = null;
  let primeiroBolao: number | null = null;
  let ultimaCompleta: { em: number; duracaoMs: number } | null = null;

  let proximoSlot = inicio;
  while (agora().getTime() < fim) {
    // próximo slot alinhado a T0 − 1 min, sempre DEPOIS do anterior (leitura longa pula slots)
    const slot = Math.max(proximoSlot, inicio + Math.ceil((agora().getTime() - inicio) / intervalo) * intervalo);
    proximoSlot = slot + intervalo;
    if (slot > agora().getTime()) await dormir(slot - agora().getTime());
    if (agora().getTime() >= fim) break;
    const t = agora();
    const atrasoSlotMs = t.getTime() - slot;
    n++;

    if (concurso === null) {
      try {
        const abertos = (await o.fonte.concursosAbertos()).filter((c) => c.modalidade === o.modalidade);
        if (abertos.length) concurso = Math.max(...abertos.map((c) => c.concurso));
      } catch (e) {
        gravar({ tipo: 'erro', leitura: n, em: agora().toISOString(), etapa: 'concursos', erro: String(e) });
      }
      if (concurso === null) {
        gravar({ tipo: 'leitura', leitura: n, inicio: t.toISOString(), concurso: null, observacao: 'concurso novo ainda não apareceu' });
        continue;
      }
      log(`concurso novo detectado: ${o.modalidade} ${concurso}`);
    }

    // instrumenta a fonte: uma linha por página lida
    let paginaN = 0;
    const instrumentada: FonteBoloes = {
      nome: o.fonte.nome,
      concursosAbertos: () => o.fonte.concursosAbertos(),
      contagens: () => o.fonte.contagens(),
      pagina: async (c) => {
        const iniEm = agora();
        let p: PaginaBoloes | undefined;
        try {
          p = await o.fonte.pagina(c);
          return p;
        } finally {
          paginaN++;
          const filas = (p?.itens ?? []).map((b) => b.filaFonte).filter((x): x is number => x !== undefined);
          const novos = (p?.itens ?? []).filter((b) => !vistos.has(b.idCaixa)).length;
          gravar({
            tipo: 'pagina',
            leitura: n,
            pagina: c.pagina,
            inicio: iniEm.toISOString(),
            fim: agora().toISOString(),
            duracaoMs: agora().getTime() - iniEm.getTime(),
            itens: p?.itens.length ?? null,
            totalItens: p?.totalItens ?? null,
            totalPaginas: p?.totalPaginas ?? null,
            filaMin: filas.length ? Math.min(...filas) : null,
            filaMax: filas.length ? Math.max(...filas) : null,
            novos,
            horaServidor: p?.horaServidor?.toISOString() ?? null,
            escopo: p?.escopo ?? null,
            // ordem da página: [número do bolão (ou id), fila] — base do `pnpm analisar-abertura`
            ordem: (p?.itens ?? []).map((b) => [decodificarCodigoBolao(b.idCaixa)?.numero ?? b.idCaixa, b.filaFonte ?? null]),
            ok: Boolean(p),
          });
        }
      },
    };

    try {
      const leitura = await varrerConcurso(instrumentada, { modalidade: o.modalidade, concurso }, { maxPaginas: o.maxPaginas ?? 200, agora });
      const duracao = leitura.terminouEm.getTime() - leitura.iniciouEm.getTime();
      let novos = 0;
      let fila1 = 0;
      for (const it of leitura.itens) {
        if (!vistos.has(it.idCaixa)) {
          vistos.add(it.idCaixa);
          novos++;
        }
        if ((it.filaFonte ?? 0) === 1) fila1++;
      }
      if (leitura.itens.length && primeiroBolao === null) primeiroBolao = (leitura.iniciouEm.getTime() - o.t0.getTime()) / 1000;
      duracoes.push(duracao);
      paginasMax = Math.max(paginasMax, leitura.paginasLidas);
      boloesMax = Math.max(boloesMax, leitura.itens.length);
      if (duracao > intervalo) {
        acima++;
        if (passouEm === null) {
          passouEm = (leitura.iniciouEm.getTime() - o.t0.getTime()) / 1000;
          paginasQuandoPassou = leitura.paginasLidas;
        }
      }
      if (leitura.completa) ultimaCompleta = { em: leitura.iniciouEm.getTime(), duracaoMs: duracao };
      const plano = planejarLeitura({
        agora: agora().getTime(),
        intervaloMs: intervalo,
        duracaoUltimaCompletaMs: ultimaCompleta?.duracaoMs ?? null,
        ultimaCompletaEm: ultimaCompleta?.em ?? null,
        boloesFila1: fila1,
        totalVisiveis: leitura.itens.length,
      });
      gravar({
        tipo: 'leitura',
        leitura: n,
        concurso,
        inicio: leitura.iniciouEm.toISOString(),
        fim: leitura.terminouEm.toISOString(),
        segundosDesdeT0: (leitura.iniciouEm.getTime() - o.t0.getTime()) / 1000,
        duracaoMs: duracao,
        atrasoSlotMs,
        paginas: leitura.paginasLidas,
        totalPaginasFonte: leitura.totalPaginasFonte ?? null,
        completa: leitura.completa,
        itens: leitura.itens.length,
        novos,
        boloesFila1: fila1,
        duplicados: leitura.duplicados,
        desvioServidorMs: leitura.desvioServidorMs ?? null,
        // o que a estratégia faria na próxima leitura (para comparar com o observado)
        proximoPlano: plano,
        erro: leitura.erro?.message ?? null,
      });
      if (leitura.erro) erros++;
      log(`${horaSP(leitura.iniciouEm)} leitura ${n}: ${leitura.paginasLidas} pág., ${leitura.itens.length} bolões (+${novos}), ${duracao} ms`);
    } catch (e) {
      erros++;
      gravar({ tipo: 'leitura', leitura: n, concurso, inicio: t.toISOString(), erro: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
      log(`leitura ${n} falhou: ${String(e)}`);
      if (e instanceof BloqueadoPelaFonteError) break; // bloqueio, idade/login, sessão expirada: para e deixa registrado
    }
  }

  const resumo: ResumoObservacao = {
    tipo: 'resumo',
    modalidade: o.modalidade,
    concurso,
    t0: o.t0.toISOString(),
    leituras: n,
    leiturasComErro: erros,
    paginasMax,
    boloesMax,
    duracaoMediaMs: duracoes.length ? Math.round(duracoes.reduce((s, x) => s + x, 0) / duracoes.length) : null,
    duracaoP95Ms: p95(duracoes),
    leiturasAcimaDoIntervalo: acima,
    passouDoIntervaloEmS: passouEm,
    paginasQuandoPassou,
    primeiroBolaoEmS: primeiroBolao,
  };
  gravar(resumo as unknown as Record<string, unknown>);
  return resumo;
}
