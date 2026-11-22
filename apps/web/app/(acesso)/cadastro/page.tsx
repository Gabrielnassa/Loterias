import Link from 'next/link';
import { MensagemDaConsulta } from '@/components/FormAcao';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cadastro' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

/** Cadastro do responsável: pessoa + conta (empresa) + lotéricas. O e-mail é confirmado por link. */
export default async function Cadastro({ searchParams }: Props) {
  const sp = await searchParams;
  return (
    <div className="space-y-4">
      <MensagemDaConsulta ok={sp.ok} erro={sp.erro} />
      <section className="cartao space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Cadastre sua lotérica</h1>
          <p className="text-sm text-zinc-500">Você vira o responsável da conta e depois convida sócios e colaboradores.</p>
        </div>
        <form method="post" action="/api/auth/cadastro" className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="rotulo">Seu nome</span>
            <input name="nome" required minLength={2} autoComplete="name" className="campo" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">E-mail</span>
            <input name="email" type="email" required autoComplete="email" className="campo" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Senha (opcional: sem senha, você entra pelo link no e-mail)</span>
            <input name="senha" type="password" minLength={8} autoComplete="new-password" className="campo" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Nome da empresa (conta)</span>
            <input name="empresa" required minLength={2} className="campo" placeholder="Ex.: Grupo Trevo" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Lotéricas (uma por linha: código=Nome)</span>
            <textarea name="lojas" required rows={3} className="campo font-mono text-sm" placeholder={'2894=Loja Centro\n21.001234-5=Loja Bairro'} />
          </label>
          <button type="submit" className="botao w-full">
            Criar conta
          </button>
        </form>
        <p className="text-xs text-zinc-500">
          O código da lotérica aparece no portal Loterias CAIXA (ex.: 21.002894-7). Nada de dados de apostadores é coletado.
        </p>
      </section>
      <p className="text-center text-sm text-zinc-500">
        Já tem conta?{' '}
        <Link className="link" href="/entrar">
          Entrar
        </Link>
      </p>
    </div>
  );
}
