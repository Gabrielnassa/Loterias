'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface Bolao {
  id: string;
  descricao: string;
  jogos: number;
  dezenas: number;
  cotas: number;
  valorCota: number;
  enviado?: boolean;
}

const CHAVE = 'radar:fila-pre-montada';

function ler(): Bolao[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as Bolao[];
  } catch {
    return [];
  }
}

function bip() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    /* sem áudio */
  }
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Cronômetro de abertura: contagem regressiva até T0, alerta (som + notificação) no horário de
 * alerta, e a fila de bolões pré-montados guardada neste aparelho, do mais valioso para o menos.
 */
export function Cronometro({ t0, alertaEm, limitePag1 }: { t0: string; alertaEm: string; limitePag1: string | null }) {
  const alvo = new Date(t0).getTime();
  const alerta = new Date(alertaEm).getTime();
  const [agora, setAgora] = useState<number | null>(null);
  const [fila, setFila] = useState<Bolao[]>([]);
  const avisou = useRef(false);
  useEffect(() => {
    setFila(ler());
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (agora === null || avisou.current || agora < alerta || agora > alvo) return;
    avisou.current = true;
    bip();
    if ('Notification' in window && Notification.permission === 'granted') new Notification('Abertura em 2 minutos', { body: 'Prepare o 1º bolão: ele define sua posição na 1ª fila.' });
  }, [agora, alerta, alvo]);
  const salvar = (f: Bolao[]) => {
    setFila(f);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(f));
    } catch {
      /* armazenamento indisponível */
    }
  };
  const ordenada = useMemo(() => [...fila].sort((a, b) => b.cotas * b.valorCota - a.cotas * a.valorCota), [fila]);
  const falta = agora === null ? null : alvo - agora;
  const fmt = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  };
  const emAlerta = falta !== null && agora! >= alerta && falta > 0;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`cartao space-y-2 ${emAlerta ? 'ring-2 ring-rose-500' : ''}`}>
        <div className="rotulo">{falta !== null && falta <= 0 ? 'Abertura em andamento' : 'Falta para a abertura'}</div>
        <div className={`tabular text-5xl font-semibold ${emAlerta ? 'animate-pulse text-rose-600 dark:text-rose-400' : ''}`} role="timer">
          {falta === null ? '—' : falta > 0 ? fmt(falta) : `+${fmt(-falta)}`}
        </div>
        <p className="text-sm text-zinc-500">
          T0 às {new Date(t0).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}; alerta às {new Date(alertaEm).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}.
          {limitePag1 ? ` Para a pág. 1 da UF, entre até ${limitePag1}.` : ''}
        </p>
        <button className="botao" type="button" onClick={() => 'Notification' in window && Notification.requestPermission()}>
          Permitir aviso no aparelho
        </button>
      </section>
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Fila de bolões pré-montados</h2>
        <p className="text-xs text-zinc-500">O mais valioso primeiro: o 1º bolão define a sua posição na 1ª fila. Fica guardado só neste aparelho.</p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const b: Bolao = { id: crypto.randomUUID(), descricao: String(f.get('descricao') || 'Bolão'), jogos: Number(f.get('jogos')), dezenas: Number(f.get('dezenas')), cotas: Number(f.get('cotas')), valorCota: Number(f.get('valor')) };
            if (b.jogos > 0 && b.dezenas > 0 && b.cotas > 0 && b.valorCota > 0) salvar([...fila, b]);
            e.currentTarget.reset();
          }}
        >
          <input name="descricao" placeholder="Loteria" className="campo w-28" />
          <input name="jogos" type="number" min={1} placeholder="Jogos" className="campo w-20" required />
          <input name="dezenas" type="number" min={1} placeholder="Dezenas" className="campo w-24" required />
          <input name="cotas" type="number" min={1} placeholder="Cotas" className="campo w-20" required />
          <input name="valor" type="number" min={0.01} step={0.01} placeholder="R$ cota" className="campo w-24" required />
          <button className="botao" type="submit">Adicionar</button>
        </form>
        <ol className="space-y-1 text-sm">
          {ordenada.map((b, i) => (
            <li key={b.id} className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 ${b.enviado ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-500/10' : 'border-zinc-200 dark:border-zinc-800'}`}>
              <span>
                <strong>{i + 1}º</strong> {b.descricao} · {b.jogos}J-{b.dezenas}D-{b.cotas}C · {brl.format(b.cotas * b.valorCota)}
              </span>
              <span className="flex gap-2">
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!b.enviado} onChange={() => salvar(fila.map((x) => (x.id === b.id ? { ...x, enviado: !x.enviado } : x)))} /> enviado</label>
                <button type="button" className="text-xs text-rose-600" onClick={() => salvar(fila.filter((x) => x.id !== b.id))}>remover</button>
              </span>
            </li>
          ))}
          {!ordenada.length ? <li className="text-zinc-500">Nenhum bolão na fila.</li> : null}
        </ol>
      </section>
    </div>
  );
}
