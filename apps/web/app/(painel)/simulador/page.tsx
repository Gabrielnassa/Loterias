import { Kpi } from '@/components/Kpi';
import { fmtMoeda, fmtPct, NOME_MODALIDADE } from '@/lib/formato';
import { ehModalidade, LIMITES_BOLAO, simularBolao, type ModalidadeSlug } from '@radar/core';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Simulador de bolões' };

const MODS: ModalidadeSlug[] = ['mega-sena', 'lotofacil', 'quina', 'dupla-sena', 'dia-de-sorte', 'timemania', 'super-sete', 'mais-milionaria', 'lotomania', 'loteca'];
const num = (v: string | undefined, p: number) => (v && Number.isFinite(Number(v)) ? Number(v) : p);

export default async function Simulador({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const modalidade: ModalidadeSlug = sp.modalidade && ehModalidade(sp.modalidade) ? sp.modalidade : 'mega-sena';
  const lim = LIMITES_BOLAO[modalidade];
  const padraoNum = lim?.numeros[0] ?? 6;
  const comFranquia = sp.franquia !== '0';
  const e = {
    modalidade,
    numeros: num(sp.numeros, padraoNum),
    trevos: num(sp.trevos, 2),
    duplos: num(sp.duplos, 3),
    triplos: num(sp.triplos, 0),
    jogos: num(sp.jogos, modalidade === 'mega-sena' ? 3 : 1),
    cotas: num(sp.cotas, 10),
    franquia: comFranquia ? num(sp.limite, Number(process.env.RADAR_FRANQUIA_LIMITE ?? 8000)) : null,
    vendaEsperada: num(sp.venda, 80) / 100,
  };
  const s = simularBolao(e);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Simulador de bolões</h1>
        <p className="text-sm text-zinc-500">Custo, valor da cota, margem e cotas, com e sem franquia, conferindo os limites oficiais do Bolão CAIXA.</p>
      </div>
      <form method="get" className="cartao flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1"><span className="rotulo">Loteria</span>
          <select name="modalidade" defaultValue={modalidade} className="campo">{MODS.map((m) => <option key={m} value={m}>{NOME_MODALIDADE[m]}</option>)}</select>
        </label>
        {modalidade === 'loteca' ? (
          <>
            <label className="flex flex-col gap-1"><span className="rotulo">Duplos</span><input name="duplos" type="number" min={0} max={9} defaultValue={e.duplos} className="campo w-20" /></label>
            <label className="flex flex-col gap-1"><span className="rotulo">Triplos</span><input name="triplos" type="number" min={0} max={6} defaultValue={e.triplos} className="campo w-20" /></label>
          </>
        ) : (
          <label className="flex flex-col gap-1"><span className="rotulo">Números por jogo</span><input name="numeros" type="number" min={1} max={50} defaultValue={e.numeros} className="campo w-24" /></label>
        )}
        {modalidade === 'mais-milionaria' ? <label className="flex flex-col gap-1"><span className="rotulo">Trevos</span><input name="trevos" type="number" min={2} max={6} defaultValue={e.trevos} className="campo w-20" /></label> : null}
        <label className="flex flex-col gap-1"><span className="rotulo">Jogos</span><input name="jogos" type="number" min={1} max={20} defaultValue={e.jogos} className="campo w-20" /></label>
        <label className="flex flex-col gap-1"><span className="rotulo">Cotas</span><input name="cotas" type="number" min={1} max={100} defaultValue={e.cotas} className="campo w-20" /></label>
        <label className="flex flex-col gap-1"><span className="rotulo">Venda esperada (%)</span><input name="venda" type="number" min={0} max={100} defaultValue={Math.round(e.vendaEsperada * 100)} className="campo w-24" /></label>
        <label className="flex flex-col gap-1"><span className="rotulo">Franquia</span>
          <select name="franquia" defaultValue={comFranquia ? '1' : '0'} className="campo"><option value="1">com franquia</option><option value="0">sem franquia</option></select>
        </label>
        {comFranquia ? <label className="flex flex-col gap-1"><span className="rotulo">Limite (R$)</span><input name="limite" type="number" min={0} step={100} defaultValue={e.franquia ?? 8000} className="campo w-28" /></label> : null}
        <button className="botao" type="submit">Simular</button>
      </form>
      {s.problemas.length ? (
        <ul className="cartao space-y-1 border-amber-300 text-sm text-amber-800 dark:border-amber-700 dark:text-amber-300">
          {s.problemas.map((p) => <li key={p}>⚠ {p}</li>)}
        </ul>
      ) : <p className="text-sm text-emerald-700 dark:text-emerald-400">Dentro dos limites oficiais do bolão.</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Valor do bolão" valor={fmtMoeda(s.valorBolao)} detalhe={`${s.apostasPorJogo} apostas por jogo · ${fmtMoeda(s.valorJogo)} cada`} />
        <Kpi rotulo="Cota (sem tarifa)" valor={fmtMoeda(s.valorCota)} detalhe={s.valorUltimaCota !== s.valorCota ? `última cota ${fmtMoeda(s.valorUltimaCota)}` : 'todas iguais'} />
        <Kpi rotulo="Cota para o cliente" valor={fmtMoeda(s.valorCotaComTarifa)} detalhe={`tarifa ${fmtMoeda(s.tarifaPorCota)}`} />
        <Kpi rotulo="Se vender tudo" valor={fmtMoeda(s.ganhoSeVenderTudo)} detalhe={`margem ${fmtPct(s.margemSobreOBolao, 1)} do bolão`} />
        <Kpi rotulo="Lucro esperado" valor={fmtMoeda(s.lucroEsperado)} detalhe={`vendendo ${Math.round(e.vendaEsperada * 100)}%`} />
        <Kpi rotulo="Empata com" valor={`${s.breakEven.cotas} cotas`} detalhe={`${fmtPct(s.breakEven.fracao, 1)} do bolão`} />
        <Kpi rotulo="Cotas permitidas" valor={s.cotasPermitidas ? `${s.cotasPermitidas.min} a ${s.cotasPermitidas.max}` : '—'} detalhe={lim ? `cota mín. ${fmtMoeda(lim.cotaMinima)} · bolão mín. ${fmtMoeda(lim.bolaoMinimo)}` : 'sem limites publicados'} />
        <Kpi rotulo="Franquia" valor={s.franquia ? `cabem ${s.franquia.cabem}` : 'sem franquia'} detalhe={s.franquia ? `de ${fmtMoeda(s.franquia.limite)}; sobram ${fmtMoeda(s.franquia.sobra)}` : 'não conta o limite diário'} />
      </div>
      {lim?.observacao ? <p className="text-xs text-zinc-500">{lim.observacao}</p> : null}
      <p className="text-xs text-zinc-500">Limites das páginas oficiais da CAIXA (21/11/2026). Tarifa de serviço de 35% truncada por cota; comissão de 8,61% sobre as apostas quando vende ao menos uma cota.</p>
    </div>
  );
}
