export function Indisponivel({ mensagem }: { mensagem: string }) {
  return (
    <div className="cartao text-sm">
      <p className="font-medium">Minha lotérica indisponível</p>
      <p className="mt-1 text-zinc-500">{mensagem}</p>
    </div>
  );
}
