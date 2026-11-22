import Link from 'next/link';
import { redirect } from 'next/navigation';
import { voltaSegura } from '@radar/core';
import { MensagemDaConsulta } from '@/components/FormAcao';
import { modoContas } from '@/lib/contas/ativo';
import { contexto } from '@/lib/contexto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Entrar' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Entrar({ searchParams }: Props) {
  const sp = await searchParams;
  const voltar = voltaSegura(sp.voltar);
  if (modoContas() === 'desligado') {
    return (
      <div className="cartao space-y-2 text-sm">
        <h1 className="text-lg font-semibold">Login desligado</h1>
        <p>Sem banco configurado, o painel abre sem login. Para ligar as contas, defina DATABASE_URL (ou RADAR_AUTH=memoria para testar).</p>
        <Link className="link" href="/">
          Abrir o painel
        </Link>
      </div>
    );
  }
  if (await contexto()) redirect(voltar);
  return (
    <div className="space-y-4">
      <MensagemDaConsulta ok={sp.ok} erro={sp.erro} />
      {sp.enviado ? (
        <div className="cartao space-y-2 text-sm">
          <p>
            <strong>Confira seu e-mail.</strong> Se houver uma conta com esse endereço, o link de acesso chega em instantes (vale 15 minutos e
            funciona uma vez).
          </p>
          {sp.dev ? (
            <p className="break-all text-xs text-zinc-500">
              Desenvolvimento (sem SMTP):{' '}
              <a className="link" href={sp.dev}>
                abrir o link
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
      <section className="cartao space-y-4">
        <h1 className="text-lg font-semibold">Entrar</h1>
        <form method="post" action="/api/auth/link" className="space-y-3">
          <input type="hidden" name="voltar" value={voltar} />
          <label className="flex flex-col gap-1">
            <span className="rotulo">E-mail</span>
            <input name="email" type="email" required autoComplete="email" className="campo" />
          </label>
          <button type="submit" className="botao w-full">
            Receber link de acesso no e-mail
          </button>
        </form>
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">Entrar com senha</summary>
          <form method="post" action="/api/auth/entrar" className="mt-3 space-y-3">
            <input type="hidden" name="voltar" value={voltar} />
            <label className="flex flex-col gap-1">
              <span className="rotulo">E-mail</span>
              <input name="email" type="email" required autoComplete="username" className="campo" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="rotulo">Senha</span>
              <input name="senha" type="password" required autoComplete="current-password" className="campo" />
            </label>
            <button type="submit" className="botao w-full">
              Entrar
            </button>
          </form>
        </details>
      </section>
      <p className="text-center text-sm text-zinc-500">
        Ainda não tem conta?{' '}
        <Link className="link" href="/cadastro">
          Cadastre sua lotérica
        </Link>
      </p>
    </div>
  );
}
