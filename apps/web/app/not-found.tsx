import Link from 'next/link';

export default function NaoEncontrado() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold">Não encontrado</h1>
      <p className="mt-2 text-sm text-zinc-500">A lotérica ou a abertura pedida não existe nos dados.</p>
      <Link href="/" className="link mt-4 inline-block text-sm">
        Voltar ao início
      </Link>
    </div>
  );
}
