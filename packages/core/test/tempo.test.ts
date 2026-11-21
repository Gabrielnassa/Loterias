import { describe, expect, it } from 'vitest';
import { diaSP, horaSP, horarioSP, isodowDoDia, semanaSP, somarDias, t0Padrao } from '../tempo/fuso';

describe('fuso America/Sao_Paulo', () => {
  it('converte horário de parede de SP para UTC (UTC−3 desde 2019)', () => {
    expect(horarioSP(2026, 11, 16, 21, 45).toISOString()).toBe('2026-11-17T00:45:00.000Z');
  });

  it('respeita o horário de verão histórico (2018, UTC−2)', () => {
    expect(horarioSP(2018, 12, 1, 12, 0).toISOString()).toBe('2018-12-01T14:00:00.000Z');
  });

  it('dia e hora em SP de um instante UTC', () => {
    const d = new Date('2026-11-17T00:45:07Z');
    expect(diaSP(d)).toBe('2026-11-16');
    expect(horaSP(d)).toBe('21:45:07');
  });

  it('semana = segunda a domingo; domingo pertence à semana da segunda anterior', () => {
    expect(semanaSP(horarioSP(2026, 11, 22, 11, 45))).toBe('2026-11-16'); // domingo
    expect(semanaSP(horarioSP(2026, 11, 16, 0, 0))).toBe('2026-11-16'); // segunda 00:00
    expect(semanaSP(horarioSP(2026, 11, 22, 23, 59, 59))).toBe('2026-11-16');
    expect(semanaSP(horarioSP(2026, 11, 23, 0, 0))).toBe('2026-11-23');
    // 02:00 UTC de segunda ainda é domingo em SP
    expect(semanaSP(new Date('2026-11-23T02:00:00Z'))).toBe('2026-11-16');
  });

  it('dia da semana ISO e soma de dias atravessando mês/ano', () => {
    expect(isodowDoDia('2026-11-16')).toBe(1);
    expect(isodowDoDia('2026-11-22')).toBe(7);
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('T0 padrão: 21:45 de segunda a sábado, 11:45 no domingo', () => {
    expect(t0Padrao('2026-11-21').toISOString()).toBe('2026-11-22T00:45:00.000Z'); // sábado 21:45
    expect(t0Padrao('2026-11-22').toISOString()).toBe('2026-11-22T14:45:00.000Z'); // domingo 11:45
    expect(horaSP(t0Padrao('2026-11-18'))).toBe('21:45:00');
  });
});
