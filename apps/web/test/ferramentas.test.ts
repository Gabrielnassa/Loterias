import { describe, expect, it } from 'vitest';
import { GET as getCalendario } from '../app/api/calendario/route';
import { POST as postLoteca } from '../app/api/loteca/route';
import { GET as getSimulador } from '../app/api/simulador/route';
import { analisarLoteca, GRADE_EXEMPLO, lerGrade } from '../lib/loteca';

const req = (caminho: string, init?: RequestInit) => new Request(`http://teste.local${caminho}`, init);

describe('calendário, simulador de bolões e Loteca (web)', () => {
  it('calendário do mês pela API', async () => {
    const j = await (await getCalendario(req('/api/calendario?mes=2026-12'))).json();
    expect(j.dados.dias).toHaveLength(31);
    expect(j.dados.dias[30].sorteios.some((s: { especial?: string }) => s.especial === 'Mega da Virada')).toBe(true);
  });
  it('simulador pela API com os limites oficiais', async () => {
    const j = await (await getSimulador(req('/api/simulador?modalidade=dupla-sena&numeros=9&jogos=1&cotas=50&franquia=8000'))).json();
    expect(j.dados).toMatchObject({ valorBolao: 252, valorCota: 5.04, problemas: [] });
    expect((await getSimulador(req('/api/simulador'))).status).toBe(400);
  });
  it('Loteca: lê a grade com odds ou Elo e devolve as 38 combinações do volante', async () => {
    const g = lerGrade('A x B; 1,80; 3,40; 4,50\nC x D; elo=1700; elo=1450\nE x F');
    expect(g[0]!.odds).toEqual([1.8, 3.4, 4.5]);
    expect([g[1]!.elo1, g[1]!.elo2]).toEqual([1700, 1450]);
    expect(g[2]).toEqual({ time1: 'E', time2: 'F' });
    const a = analisarLoteca(GRADE_EXEMPLO);
    expect(a.jogos).toHaveLength(14);
    expect(a.tabela).toHaveLength(38);
    expect(a.escolhida).toMatchObject({ duplos: 3, triplos: 0 });
    const r = await postLoteca(req('/api/loteca', { method: 'POST', body: JSON.stringify({ grade: GRADE_EXEMPLO, duplos: 5, triplos: 3 }), headers: { 'content-type': 'application/json' } }));
    expect((await r.json()).dados.escolhida.apostas).toBe(864);
    expect((await postLoteca(req('/api/loteca', { method: 'POST', body: JSON.stringify({ grade: 'A x B' }) }))).status).toBe(400);
  });
});
