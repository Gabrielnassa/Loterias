'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fmtAtraso, fmtHora } from '@/lib/formato';

interface Linha {
  ordem: number;
  loterica: { codigoCaixa: string; nome: string; cidade: string; uf: string };
  primeiroEm: string;
  atrasoS: number;
  posUf: number;
  paginaUf: number;
  posBrasil: number;
  nBoloes: number;
  empate: boolean;
  destaque: boolean;
}
export interface DadosAoVivo {
  agora: string;
  t0: string;
  modalidade: string;
  ultimaLeitura: string | null;
  total: number;
  linhas: Linha[];
  minhaPosicao: number | null;
}

/** Tela 5: assina o SSE /api/aberturas/ao-vivo e redesenha a cada leitura (5 s). */
export function AoVivoPainel({ uf, destaque, inicial }: { uf: string; destaque: string; inicial: DadosAoVivo }) {
  const [d, setD] = useState<DadosAoVivo>(inicial);
  const [conectado, setConectado] = useState(false);
  useEffect(() => {
    const es = new EventSource(`/api/aberturas/ao-vivo?uf=${encodeURIComponent(uf)}&destaque=${encodeURIComponent(destaque)}`);
    es.addEventListener('leitura', (e) => {
      setD(JSON.parse((e as MessageEvent).data) as DadosAoVivo);
      setConectado(true);
    });
    es.onerror = () => setConectado(false);
    return () => es.close();
  }, [uf, destaque]);

  const minha = d.linhas.find((l) => l.destaque);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="cartao">
          <div className="rotulo">Abertura</div>
          <div className="tabular mt-1 text-lg font-semibold">T0 {fmtHora(d.t0)}</div>
          <div className="text-xs text-zinc-500">Lotofácil (simulada)</div>
        </div>
        <div className="cartao">
          <div className="rotulo">Última leitura</div>
          <div className="tabular mt-1 text-lg font-semibold">{d.ultimaLeitura ? fmtHora(d.ultimaLeitura) : '—'}</div>
          <div className={`text-xs ${conectado ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}`}>{conectado ? '● ao vivo' : 'conectando…'}</div>
        </div>
        <div className="cartao">
          <div className="rotulo">Lotéricas na UF</div>
          <div className="tabular mt-1 text-lg font-semibold">{d.linhas.length}</div>
          <div className="text-xs text-zinc-500">{d.total} no Brasil</div>
        </div>
        <div className={`cartao ${minha ? 'ring-2 ring-sky-500' : ''}`}>
          <div className="rotulo">Sua posição</div>
          <div className="tabular mt-1 text-lg font-semibold">{minha ? `${minha.ordem}º a chegar` : 'ainda não entrou'}</div>
          <div className="text-xs text-zinc-500">{minha ? `${minha.posUf}º na UF · pág. ${minha.paginaUf} · ${fmtAtraso(minha.atrasoS)}` : ''}</div>
        </div>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela min-w-[640px]">
          <thead>
            <tr>
              <th>#</th>
              <th>Entrada</th>
              <th>Atraso</th>
              <th>Lotérica</th>
              <th className="text-right">UF</th>
              <th className="text-right">Brasil</th>
              <th className="text-right">Bolões</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {d.linhas.map((l) => (
              <tr key={l.loterica.codigoCaixa} className={l.destaque ? 'bg-sky-100 font-semibold dark:bg-sky-500/20' : ''}>
                <td className="text-zinc-500">{l.ordem}</td>
                <td>
                  {fmtHora(l.primeiroEm)}
                  {l.empate ? <span className="ml-1 text-xs text-zinc-400" title="Mesma leitura: ordem pela fonte">=</span> : null}
                </td>
                <td className="text-zinc-500">{fmtAtraso(l.atrasoS)}</td>
                <td>
                  <Link className="link" href={`/lotericas/${l.loterica.codigoCaixa}`}>
                    {l.loterica.nome}
                  </Link>
                  <span className="ml-1 text-xs text-zinc-500">{l.loterica.cidade}</span>
                </td>
                <td className="text-right">
                  {l.posUf}º <span className="text-xs text-zinc-500">p{l.paginaUf}</span>
                </td>
                <td className="text-right">{l.posBrasil}º</td>
                <td className="text-right">{l.nBoloes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.linhas.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Nenhuma lotérica da UF entrou ainda.</p> : null}
      </div>
    </div>
  );
}
