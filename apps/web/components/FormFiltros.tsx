'use client';

import type { ReactNode } from 'react';

/** Formulário GET que reenvia sozinho quando um seletor muda. */
export function FormFiltros({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <form
      method="get"
      className={`flex flex-wrap items-end gap-3 ${className}`}
      onChange={(e) => {
        const alvo = e.target as HTMLElement;
        if (alvo.tagName === 'SELECT') e.currentTarget.requestSubmit();
      }}
    >
      {children}
      <button type="submit" className="botao">
        Aplicar
      </button>
    </form>
  );
}

export function Seletor({ nome, rotulo, valor, opcoes }: { nome: string; rotulo: string; valor: string; opcoes: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="rotulo">{rotulo}</span>
      <select name={nome} defaultValue={valor} className="campo">
        {opcoes.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
