'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

/**
 * Formulário que grava por uma API (POST) e mostra o resultado ali mesmo, sem sair da tela.
 * Sem JavaScript, vira um POST comum (a API redireciona de volta com ?ok= ou ?erro=).
 * Na demonstração estática, o fetch é atendido no navegador (demo/preparar.ts).
 */
export function FormAcao({
  acao,
  children,
  className = '',
  confirmar,
  limpar = false,
}: {
  acao: string;
  children: ReactNode;
  className?: string;
  /** Pergunta antes de enviar (ações destrutivas). */
  confirmar?: string;
  /** Limpa os campos depois de dar certo. */
  limpar?: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [r, setR] = useState<{ ok?: string; erro?: string; link?: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  return (
    <form
      method="post"
      action={acao}
      data-acao=""
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (confirmar && !window.confirm(confirmar)) return;
        setOcupado(true);
        setR(null);
        setCopiado(false);
        try {
          const resp = await fetch(acao, { method: 'POST', body: new FormData(form), headers: { accept: 'application/json' } });
          const j = (await resp.json().catch(() => ({ erro: `falhou (${resp.status})` }))) as { ok?: string; erro?: string; link?: string; redirecionar?: string };
          setR(j);
          if (resp.ok && !j.erro) {
            if (limpar) form.reset();
            if (j.redirecionar) router.push(j.redirecionar);
            else router.refresh();
            window.dispatchEvent(new Event('demo:atualizar'));
          }
        } catch (err) {
          setR({ erro: (err as Error).message });
        } finally {
          setOcupado(false);
        }
      }}
    >
      <fieldset disabled={ocupado} className="contents">
        {children}
      </fieldset>
      {r?.erro ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {r.erro}
        </p>
      ) : null}
      {r?.ok ? (
        <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
          {r.ok}
        </p>
      ) : null}
      {r?.link ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <input readOnly value={r.link} className="campo min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="botao"
            onClick={async () => {
              await navigator.clipboard?.writeText(r.link!).catch(() => {});
              setCopiado(true);
            }}
          >
            {copiado ? 'Copiado' : 'Copiar link'}
          </button>
        </div>
      ) : null}
    </form>
  );
}

/** Mensagem de ?ok= / ?erro= (formulários sem JavaScript). */
export function MensagemDaConsulta({ ok, erro }: { ok?: string | undefined; erro?: string | undefined }) {
  if (!ok && !erro) return null;
  return (
    <p role={erro ? 'alert' : 'status'} className={`rounded-md px-3 py-2 text-sm ${erro ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
      {erro ?? ok}
    </p>
  );
}
