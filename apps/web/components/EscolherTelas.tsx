import { TELAS, TELAS_PADRAO_COLABORADOR, type GrupoTela } from '@radar/core';

/** Caixas de marcar das telas (para colaboradores), agrupadas. Telas de gestão da conta não entram. */
export function EscolherTelas({ marcadas, nome = 'telas' }: { marcadas?: readonly string[] | null; nome?: string }) {
  const atuais = new Set(marcadas ?? TELAS_PADRAO_COLABORADOR);
  const grupos = new Map<GrupoTela, (typeof TELAS)[number][]>();
  for (const t of TELAS) if (!t.soGestores) grupos.set(t.grupo, [...(grupos.get(t.grupo) ?? []), t]);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[...grupos.entries()].map(([g, ts]) => (
        <fieldset key={g} className="space-y-1">
          <legend className="rotulo">{g}</legend>
          {ts.map((t) => (
            <label key={t.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={nome} value={t.id} defaultChecked={atuais.has(t.id)} className="mt-0.5" />
              <span>{t.nome}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

/** Lojas que um colaborador vê ("todas" = também as que entrarem depois). */
export function EscolherLojas({ lojas, marcadas }: { lojas: readonly { codigo: string; nome: string }[]; marcadas?: readonly string[] | null }) {
  if (lojas.length <= 1) return null;
  return (
    <fieldset className="space-y-1">
      <legend className="rotulo">Lojas</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="lojas_todas" value="1" defaultChecked={!marcadas} />
        <span>Todas as lojas da conta</span>
      </label>
      {lojas.map((l) => (
        <label key={l.codigo} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="lojas" value={l.codigo} defaultChecked={!!marcadas?.includes(l.codigo)} />
          <span>
            {l.nome} <span className="text-zinc-400">({l.codigo})</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
