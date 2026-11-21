import { describe, expect, it } from 'vitest';
import { CONFIG_COLETA_PADRAO, fechamentoPadrao, modoDoConcurso, preverProximaAbertura, tarefasDevidas } from '../coleta/plano';
import { horaSP, horarioSP } from '../tempo/fuso';
import { cronogramaAbertura } from '../simulacao/abertura-simulada';

const T0 = horarioSP(2026, 11, 16, 21, 45); // segunda 21:45
const mais = (s: number) => new Date(T0.getTime() + s * 1000);
const concurso = { modalidade: 'lotofacil' as const, concurso: 3500, abreEm: T0, fechaEm: horarioSP(2026, 11, 17, 20, 0) };

describe('modo de coleta', () => {
  it('antes de T0 − 1 min: aguardando', () => {
    expect(modoDoConcurso(mais(-61), concurso).modo).toBe('aguardando');
  });
  it('de T0 − 1 min a T0 + 15 min: abertura a cada 5 s, slots alinhados a T0', () => {
    expect(modoDoConcurso(mais(-60), concurso)).toMatchObject({ modo: 'abertura', intervaloMs: 5000, slot: 0 });
    const m = modoDoConcurso(mais(0), concurso);
    expect(m).toMatchObject({ modo: 'abertura', slot: 12 });
    expect(m.modo === 'abertura' && m.slotEm.getTime()).toBe(T0.getTime());
    expect(modoDoConcurso(mais(7), concurso)).toMatchObject({ slot: 13 });
    expect(modoDoConcurso(mais(15 * 60 - 1), concurso)).toMatchObject({ intervaloMs: 5000, slot: 191 });
  });
  it('de T0 + 15 min a T0 + 60 min: abertura a cada 15 s', () => {
    expect(modoDoConcurso(mais(15 * 60), concurso)).toMatchObject({ modo: 'abertura', intervaloMs: 15000, slot: 192 });
    expect(modoDoConcurso(mais(15 * 60 + 14), concurso)).toMatchObject({ slot: 192 });
    expect(modoDoConcurso(mais(15 * 60 + 15), concurso)).toMatchObject({ slot: 193 });
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
  it('cronograma da abertura: 192 leituras de 5 s + 180 de 15 s', () => {
    const c = cronogramaAbertura(T0);
    expect(c).toHaveLength(372);
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
    const ts = tarefasDevidas(depois, [concurso], new Map([['contagens', Number.MAX_SAFE_INTEGER]]));
    expect(ts).toEqual([expect.objectContaining({ tipo: 'encerrar', chave: 'encerrar:lotofacil#3500' })]);
    expect(tarefasDevidas(depois, [concurso], new Map([['contagens', Number.MAX_SAFE_INTEGER], ['encerrar:lotofacil#3500', 0]]))).toEqual([]);
  });

  it('configuração alternativa (ex.: 5 s até T0 + 30 min)', () => {
    const cfg = { ...CONFIG_COLETA_PADRAO, aberturaRapidaMs: 30 * 60_000 };
    expect(modoDoConcurso(mais(20 * 60), concurso, cfg)).toMatchObject({ intervaloMs: 5000 });
  });
});

describe('calendário de aberturas', () => {
  it('próximo concurso abre no T0 padrão do dia do sorteio', () => {
    const sab = preverProximaAbertura({ modalidade: 'mega-sena', concurso: 2950, dataSorteio: '2026-11-21' });
    expect(sab.concurso).toBe(2951);
    expect(horaSP(sab.abreEm)).toBe('21:45:00');
    expect(horaSP(preverProximaAbertura({ modalidade: 'quina', concurso: 1, dataSorteio: '2026-11-22' }).abreEm)).toBe('11:45:00');
  });
  it('fechamento padrão da modalidade', () => {
    expect(horaSP(fechamentoPadrao('lotofacil', '2026-11-17'))).toBe('20:00:00');
  });
});
