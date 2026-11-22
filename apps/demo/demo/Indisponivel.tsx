/** Telas que precisam do banco (dados da própria lotérica) não rodam na demonstração estática. */
export function Indisponivel({ mensagem }: { mensagem: string }) {
  return (
    <div className="cartao space-y-2 border-amber-300 dark:border-amber-700">
      <h2 className="font-semibold">Esta tela precisa do servidor</h2>
      <p className="text-sm">
        Ela lê os bolões da sua lotérica no banco de dados (gravados pelo coletor). Na demonstração estática não há banco: rode o sistema completo
        (veja o README) para usá-la.
      </p>
      <p className="text-xs text-zinc-500">Detalhe: {mensagem}</p>
    </div>
  );
}
