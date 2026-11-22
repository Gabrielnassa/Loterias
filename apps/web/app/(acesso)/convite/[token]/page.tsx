import Link from 'next/link';
import { NOME_PAPEL } from '@radar/core';
import { MensagemDaConsulta } from '@/components/FormAcao';
import { repositorioContas } from '@/lib/contas/ativo';
import { estadoDoConvite } from '@/lib/contas/equipe';
import { hashToken } from '@/lib/contas/token';
import { contexto } from '@/lib/contexto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Convite' };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function Convite({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const repo = repositorioContas();
  const c = repo ? await repo.convitePorToken(await hashToken(token)) : null;
  const conta = c && repo ? await repo.conta(c.contaId) : null;
  const estado = c ? estadoDoConvite(c, new Date()) : null;
  const ctx = await contexto();
  const temCadastro = c && repo ? !!(await repo.usuarioPorEmail(c.email)) : false;
  return (
    <div className="space-y-4">
      <MensagemDaConsulta ok={sp.ok} erro={sp.erro} />
      <section className="cartao space-y-4">
        {!c || !conta ? (
          <p className="text-sm">Convite não encontrado. Peça um novo para quem convidou você.</p>
        ) : estado !== 'pendente' ? (
          <p className="text-sm">Este convite {estado === 'aceito' ? 'já foi usado' : estado === 'cancelado' ? 'foi cancelado' : 'venceu'}. Peça outro para quem convidou você.</p>
        ) : (
          <>
            <div>
              <h1 className="text-lg font-semibold">Convite para {conta.nome}</h1>
              <p className="text-sm text-zinc-500">
                Para {c.email}, como {NOME_PAPEL[c.papel].toLowerCase()}.
              </p>
            </div>
            {ctx ? (
              ctx.usuario.email === c.email ? (
                <form method="post" action="/api/auth/convite">
                  <input type="hidden" name="token" value={token} />
                  <button type="submit" className="botao w-full">
                    Aceitar e entrar na conta
                  </button>
                </form>
              ) : (
                <p className="text-sm">
                  Você está logado como {ctx.usuario.email}. Este convite é para {c.email}:{' '}
                  <span className="text-zinc-500">saia e entre com esse e-mail.</span>
                </p>
              )
            ) : temCadastro ? (
              <p className="text-sm">
                Você já tem cadastro.{' '}
                <Link className="link" href={`/entrar?voltar=${encodeURIComponent(`/convite/${token}`)}`}>
                  Entre com {c.email}
                </Link>{' '}
                e volte aqui para aceitar.
              </p>
            ) : (
              <form method="post" action="/api/auth/convite" className="space-y-3">
                <input type="hidden" name="token" value={token} />
                <label className="flex flex-col gap-1">
                  <span className="rotulo">Seu nome</span>
                  <input name="nome" required minLength={2} autoComplete="name" className="campo" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="rotulo">Senha (opcional: sem senha, você entra pelo link no e-mail)</span>
                  <input name="senha" type="password" minLength={8} autoComplete="new-password" className="campo" />
                </label>
                <button type="submit" className="botao w-full">
                  Aceitar o convite
                </button>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
