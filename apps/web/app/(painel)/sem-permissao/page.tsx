import Link from 'next/link';
import { TELAS } from '@radar/core';
import { contexto } from '@/lib/contexto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sem permissão' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function SemPermissao({ searchParams }: Props) {
  const sp = await searchParams;
  const ctx = await contexto();
  const tela = TELAS.find((t) => t.id === sp.tela);
  const liberadas = TELAS.filter((t) => ctx?.telas.includes(t.id));
  return (
    <div className="cartao mx-auto max-w-xl space-y-3">
      <h1 className="text-lg font-semibold">Sem permissão</h1>
      <p className="text-sm">
        {tela ? (
          <>
            Sua conta não libera <strong>{tela.nome}</strong> para você.
          </>
        ) : (
          'Esta tela não está liberada para você.'
        )}{' '}
        {tela?.soGestores === 'plano' ? 'Só o responsável cuida do plano.' : 'Peça ao responsável (ou a um sócio) em Equipe.'}
      </p>
      {ctx && !ctx.conta ? (
        <p className="text-sm">
          Você não está em nenhuma conta.{' '}
          <Link className="link" href="/conta">
            Crie uma ou aceite um convite
          </Link>
          .
        </p>
      ) : null}
      {liberadas.length ? (
        <div className="text-sm">
          <p className="rotulo mb-1">Telas liberadas para você</p>
          <ul className="list-inside list-disc space-y-0.5">
            {liberadas.map((t) => {
              const href = t.rotas.find((r) => !r.startsWith('/api/'));
              return href ? (
                <li key={t.id}>
                  <Link className="link" href={href}>
                    {t.nome}
                  </Link>
                </li>
              ) : null;
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
