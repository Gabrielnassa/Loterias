import { describe, expect, it } from 'vitest';
import { CONFIG_COLETA_PADRAO, fechamentoPadrao, modoDoConcurso, tarefasDevidas } from '../coleta/plano';
import { ajustarT0, preverAbertura, REGRAS_ABERTURA_PADRAO, type RegraAbertura } from '../coleta/calendario';
import { horaSP, horarioSP } from '../tempo/fuso';
import { cronogramaAbertura } from '../simulacao/abertura-simulada';

const T0 = horarioSP(2026, 11, 16, 21, 45); // segunda 21:45
const mais = (s: number) => new Date(T0.getTime() + s * 1000);
const concurso = { modalidade: 'lotofacil' as const, concurso: 3500, abreEm: T0, fechaEm: horarioSP(2026, 11, 17, 20, 0) };

describe('modo de coleta', () => {
  it('antes de T0 − 1 min: aguardando', () => {
    expect(modoDoConcurso(mais(-61), concurso).modo).toBe('aguardando');
  });
  it('de T0 − 1 min a T0 + 30 min: abertura a cada 5 s, slots alinhados a T0', () => {
    expect(modoDoConcurso(mais(-60), concurso)).toMatchObject({ modo: 'abertura', intervaloMs: 5000, slot: 0 });
    const m = modoDoConcurso(mais(0), concurso);
    expect(m).toMatchObject({ modo: 'abertura', slot: 12 });
    expect(m.modo === 'abertura' && m.slotEm.getTime()).toBe(T0.getTime());
    expect(modoDoConcurso(mais(7), concurso)).toMatchObject({ slot: 13 });
    expect(modoDoConcurso(mais(15 * 60), concurso)).toMatchObject({ intervaloMs: 5000, slot: 192 });
    expect(modoDoConcurso(mais(30 * 60 - 1), concurso)).toMatchObject({ intervaloMs: 5000, slot: 371 });
  });
  it('de T0 + 30 min a T0 + 60 min: abertura a cada 15 s', () => {
    expect(modoDoConcurso(mais(30 * 60), concurso)).toMatchObject({ modo: 'abertura', intervaloMs: 15000, slot: 372 });
    expect(modoDoConcurso(mais(30 * 60 + 14), concurso)).toMatchObject({ slot: 372 });
    expect(modoDoConcurso(mais(30 * 60 + 15), concurso)).toMatchObject({ slot: 373 });
    expect(modoDoConcurso(mais(3599), concurso)).toMatchObject({ modo: 'abertura' });
  });
  it('depois de T0 + 60 min: normal (5 min); depois do fechamento: fechado', () => {
    expect(modoDoConcurso(mais(3600), concurso)).toMatchObject({ modo: 'normal', intervaloMs: 300_000 });
    expect(modoDoConcurso(concurso.fechaEm, concurso).modo).toBe('fechado');
    expect(modoDoConcurso(mais(100), { ...concurso, encerrado: true }).modo).toBe('fechado');
  });
  it('concurso sem abre_em segue no normal', () => {
    expect(modoDoConcurso(mais(0), { modalidade: 'quina', concurso: 7000 }).modo).toBe('normal');
  });
  it('cronograma da abertura: 372 leituras de 5 s + 120 de 15 s', () => {
    const c = cronogramaAbertura(T0);
    expect(c).toHaveLength(492);
    expect(c[12]!.getTime()).toBe(T0.getTime());
    expect(c[0]!.getTime()).toBe(T0.getTime() - 60_000);
  });
});

describe('tarefas devidas', () => {
  const outro = { modalidade: 'quina' as const, concurso: 7000 };

  it('abertura primeiro, depois contagens, depois normal', () => {
    const ts = tarefasDevidas(mais(0), [concurso, outro], new Map());
    expect(ts.map((t) => t.tipo + ':' + ('modo' in t ? t.modo : ''))).toEqual(['varredura:abertura', 'contagens:', 'varredura:normal']);
  });

  it('idempotente dentro do mesmo slot', () => {
    const ultimos = new Map<string, number>();
    for (const t of tarefasDevidas(mais(0), [concurso], ultimos)) ultimos.set(t.chave, t.slot);
    expect(tarefasDevidas(mais(4), [concurso], ultimos)).toEqual([]);
    const prox = tarefasDevidas(mais(5), [concurso], ultimos);
    expect(prox).toHaveLength(1);
    expect(prox[0]).toMatchObject({ tipo: 'varredura', modo: 'abertura', slot: 13 });
  });

  it('encerrar sai uma vez depois do fechamento', () => {
    const depois = new Date(concurso.fechaEm.getTime() + 1000);
    const processado = { ...concurso, aberturaProcessada: true };
    const ts = tarefasDevidas(depois, [processado], new Map([['contagens', Number.MAX_SAFE_INTEGER]]));
    expect(ts).toEqual([expect.objectContaining({ tipo: 'encerrar', chave: 'encerrar:lotofacil#3500' })]);
    expect(tarefasDevidas(depois, [processado], new Map([['contagens', Number.MAX_SAFE_INTEGER], ['encerrar:lotofacil#3500', 0]]))).toEqual([]);
    // se a janela nunca foi processada (worker fora do ar), as duas tarefas saem
    expect(tarefasDevidas(depois, [concurso], new Map([['contagens', Number.MAX_SAFE_INTEGER]])).map((t) => t.tipo).sort()).toEqual(['abertura', 'encerrar']);
  });

  it('configuração alternativa (ex.: 5 s só até T0 + 15 min)', () => {
    const cfg = { ...CONFIG_COLETA_PADRAO, aberturaRapidaMs: 15 * 60_000 };
    expect(modoDoConcurso(mais(20 * 60), concurso, cfg)).toMatchObject({ intervaloMs: 15000 });
  });
});

describe('fim da janela da abertura', () => {
  it('sai uma vez em T0 + 60 min e não sai se já processada', () => {
    expect(tarefasDevidas(mais(3599), [concurso], new Map()).some((t) => t.tipo === 'abertura')).toBe(false);
    const ts = tarefasDevidas(mais(3600), [concurso], new Map());
    const t = ts.find((x) => x.tipo === 'abertura')!;
    expect(t).toMatchObject({ chave: 'fechar-abertura:lotofacil#3500', slot: 0, t0: T0 });
    expect(t.agendadaPara.getTime()).toBe(T0.getTime() + 3600_000);
    expect(tarefasDevidas(mais(3700), [concurso], new Map([[t.chave, 0]])).some((x) => x.tipo === 'abertura')).toBe(false);
    expect(tarefasDevidas(mais(3700), [{ ...concurso, aberturaProcessada: true }], new Map()).some((x) => x.tipo === 'abertura')).toBe(false);
  });
  it('encerrar leva o T0 para recalcular as participações com a sobra', () => {
    const depois = new Date(concurso.fechaEm.getTime() + 1000);
    const t = tarefasDevidas(depois, [{ ...concurso, aberturaProcessada: true }], new Map([['contagens', Number.MAX_SAFE_INTEGER]]))[0]!;
    expect(t).toMatchObject({ tipo: 'encerrar', t0: T0 });
  });
});

describe('calendário de aberturas (T0 por concurso)', () => {
  it('padrão: abre 45 min depois do sorteio do concurso anterior (Mega 3.089 dom 11:00 -> 3.090 abre 11:45)', () => {
    const p = preverAbertura({ modalidade: 'mega-sena', concurso: 3089, dataSorteio: '2026-11-22', sorteioEm: horarioSP(2026, 11, 22, 11, 0) })!;
    expect(p).toMatchObject({ concurso: 3090, regra: 'apos-sorteio' });
    expect(horaSP(p.abreEm)).toBe('11:45:00');
    // Lotofácil 3.839 sorteia qui 26/11 21:00 -> 3.840 abre qui 21:45
    const l = preverAbertura({ modalidade: 'lotofacil', concurso: 3839, dataSorteio: '2026-11-26', sorteioEm: horarioSP(2026, 11, 26, 21, 0) })!;
    expect(l.abreEm.toISOString()).toBe(horarioSP(2026, 11, 26, 21, 45).toISOString());
  });
  it('sem hora do sorteio: domingo 11:45, demais dias 21:45', () => {
    expect(horaSP(preverAbertura({ modalidade: 'quina', concurso: 1, dataSorteio: '2026-11-22' })!.abreEm)).toBe('11:45:00');
    expect(horaSP(preverAbertura({ modalidade: 'quina', concurso: 1, dataSorteio: '2026-11-21' })!.abreEm)).toBe('21:45:00');
    expect(preverAbertura({ modalidade: 'quina', concurso: 1 })).toBeNull();
  });
  it('regras editáveis: uma regra específica da modalidade vence a genérica', () => {
    const regras: RegraAbertura[] = [...REGRAS_ABERTURA_PADRAO, { id: 'timemania-30', modalidade: 'timemania', minutosAposSorteio: 30, prioridade: 1, ativo: true }];
    const sorteioEm = horarioSP(2026, 11, 22, 11, 0);
    expect(horaSP(preverAbertura({ modalidade: 'timemania', concurso: 2300, dataSorteio: '2026-11-22', sorteioEm }, regras)!.abreEm)).toBe('11:30:00');
    expect(horaSP(preverAbertura({ modalidade: 'mega-sena', concurso: 3089, dataSorteio: '2026-11-22', sorteioEm }, regras)!.abreEm)).toBe('11:45:00');
    const inativa = regras.map((r) => (r.id === 'timemania-30' ? { ...r, ativo: false } : r));
    expect(horaSP(preverAbertura({ modalidade: 'timemania', concurso: 2300, dataSorteio: '2026-11-22', sorteioEm }, inativa)!.abreEm)).toBe('11:45:00');
  });
  it('ajuste do T0 pelo 1º bolão visto', () => {
    const previsto = horarioSP(2026, 11, 22, 11, 45);
    const vazio = horarioSP(2026, 11, 22, 21, 44, 55);
    const primeiro = horarioSP(2026, 11, 22, 21, 45, 5);
    // previsão errada (11:45) e o concurso abriu às 21:45: ajusta
    expect(ajustarT0({ previsto, origem: 'regra', ultimaLeituraVaziaEm: vazio, primeiroVistoEm: primeiro })).toEqual({ abreEm: horarioSP(2026, 11, 22, 21, 45), origem: 'primeiro_bolao' });
    // previsão certa: mantém
    expect(ajustarT0({ previsto: horarioSP(2026, 11, 22, 21, 45), origem: 'regra', ultimaLeituraVaziaEm: vazio, primeiroVistoEm: primeiro })).toBeNull();
    // manual nunca muda; sem leitura vazia antes não dá para saber; lacuna grande também não
    expect(ajustarT0({ previsto, origem: 'manual', ultimaLeituraVaziaEm: vazio, primeiroVistoEm: primeiro })).toBeNull();
    expect(ajustarT0({ previsto, origem: 'regra', ultimaLeituraVaziaEm: null, primeiroVistoEm: primeiro })).toBeNull();
    expect(ajustarT0({ previsto, origem: 'regra', ultimaLeituraVaziaEm: horarioSP(2026, 11, 22, 21, 30), primeiroVistoEm: primeiro })).toBeNull();
  });
  it('fechamento padrão da modalidade', () => {
    expect(horaSP(fechamentoPadrao('lotofacil', '2026-11-17'))).toBe('20:00:00');
  });
});
