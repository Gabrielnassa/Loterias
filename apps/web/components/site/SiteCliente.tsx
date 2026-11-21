'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** Id anônimo e aleatório deste navegador (sem dado pessoal), só para contar pessoas. */
function visitante(): string {
  try {
    let v = localStorage.getItem('radar:visitante');
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem('radar:visitante', v);
    }
    return v;
  } catch {
    return 'anonimo';
  }
}

export function enviarEvento(slug: string, tipo: 'visita' | 'whatsapp' | 'caixa' | 'carrinho', bolaoId?: string) {
  const corpo = JSON.stringify({ tipo, visitante: visitante(), ...(bolaoId ? { bolaoId } : {}) });
  const url = `/api/site/${slug}/evento`;
  try {
    if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([corpo], { type: 'application/json' }));
    else void fetch(url, { method: 'POST', body: corpo, headers: { 'content-type': 'application/json' }, keepalive: true });
  } catch {
    /* métrica não pode quebrar o site */
  }
}

export function RegistrarVisita({ slug }: { slug: string }) {
  useEffect(() => enviarEvento(slug, 'visita'), [slug]);
  return null;
}

export function LinkRastreado({ slug, tipo, href, bolaoId, className, children }: { slug: string; tipo: 'whatsapp' | 'caixa'; href: string; bolaoId?: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={() => enviarEvento(slug, tipo, bolaoId)}>
      {children}
    </a>
  );
}

interface ItemCarrinho {
  id: string;
  modalidade: string;
  concurso: number;
  formato: string;
  valorCota: number;
  max: number;
  cotas: number;
}

const Ctx = createContext<{ adicionar: (i: Omit<ItemCarrinho, 'cotas'>) => void } | null>(null);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Carrinho: junta cotas de vários bolões e manda o pedido pelo WhatsApp (a lotérica confirma). */
export function Carrinho({ slug, nome, whatsapp, children }: { slug: string; nome: string; whatsapp: string | null; children: ReactNode }) {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const ctx = useMemo(
    () => ({
      adicionar: (i: Omit<ItemCarrinho, 'cotas'>) => {
        setItens((xs) => (xs.some((x) => x.id === i.id) ? xs.map((x) => (x.id === i.id ? { ...x, cotas: Math.min(x.max, x.cotas + 1) } : x)) : [...xs, { ...i, cotas: 1 }]));
        enviarEvento(slug, 'carrinho', i.id);
      },
    }),
    [slug],
  );
  const mudar = (id: string, cotas: number) => setItens((xs) => xs.flatMap((x) => (x.id !== id ? [x] : cotas <= 0 ? [] : [{ ...x, cotas: Math.min(x.max, cotas) }])));
  const total = itens.reduce((s, i) => s + i.cotas * i.valorCota, 0);
  const texto = [`Olá, ${nome}! Quero reservar:`, ...itens.map((i) => `• ${i.cotas} cota${i.cotas > 1 ? 's' : ''} ${i.modalidade} ${i.concurso} (${i.formato}) a ${brl.format(i.valorCota)}`), `Total: ${brl.format(total)}`].join('\n');
  return (
    <Ctx.Provider value={ctx}>
      {children}
      {itens.length ? (
        <div className="site-cartao fixed inset-x-3 bottom-3 z-20 mx-auto max-w-3xl space-y-2 p-3 shadow-xl">
          <ul className="space-y-1 text-sm">
            {itens.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <span>
                  {i.modalidade} {i.concurso} · {i.formato}
                </span>
                <span className="flex items-center gap-2">
                  <input aria-label="cotas" type="number" min={0} max={i.max} value={i.cotas} onChange={(e) => mudar(i.id, Number(e.target.value))} className="site-campo w-16" />
                  <span className="w-24 text-right tabular">{brl.format(i.cotas * i.valorCota)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between">
            <strong className="tabular">Total {brl.format(total)}</strong>
            {whatsapp ? (
              <a className="site-botao" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(texto)}`} onClick={() => enviarEvento(slug, 'whatsapp')}>
                Enviar pedido no WhatsApp
              </a>
            ) : (
              <span className="site-suave text-sm">Peça na lotérica ou compre pelo site da CAIXA.</span>
            )}
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

export function BotaoAdicionar(p: Omit<ItemCarrinho, 'cotas'>) {
  const c = useContext(Ctx);
  return (
    <button type="button" className="site-botao" onClick={() => c?.adicionar(p)}>
      Quero cota
    </button>
  );
}
