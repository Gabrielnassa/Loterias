import Link from 'next/link';
import { NOME_PAPEL } from '@radar/core';
import { FormAcao, MensagemDaConsulta } from '@/components/FormAcao';
import { contexto } from '@/lib/contexto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minha conta' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function MinhaConta({ searchParams }: Props) {
  const sp = await searchParams;
  const ctx = await contexto();
  if (!ctx) {
    return (
      <div className="cartao space-y-2 text-sm">
        <h1 className="text-lg font-semibold">Minha conta</h1>
        <p>
          As contas estão desligadas (sem banco): o painel abre sem login e as lotéricas vêm de RADAR_MINHA_LOTERICA.{' '}
          <Link className="link" href="/entrar">
            Saiba como ligar
          </Link>
          .
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Minha conta</h1>
        <p className="text-sm text-zinc-500">{ctx.usuario.email}</p>
      </div>
      <MensagemDaConsulta ok={sp.ok} erro={sp.erro} />

      {ctx.plano ? (
        <section className="cartao flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            Plano da conta: <strong>{ctx.plano.nome}</strong>
            {ctx.plano.diasRestantesTeste ? ` (teste grátis, faltam ${ctx.plano.diasRestantesTeste} dias)` : ''}
          </span>
          {ctx.telas.includes('plano') ? (
            <Link className="botao" href="/planos">
              Ver planos
            </Link>
          ) : null}
        </section>
      ) : null}

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Perfil</h2>
        <FormAcao acao="/api/conta" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="acao" value="perfil" />
          <label className="flex flex-col gap-1">
            <span className="rotulo">Nome</span>
            <input name="nome" defaultValue={ctx.usuario.nome} required minLength={2} className="campo w-72" />
          </label>
          <button type="submit" className="botao">
            Salvar
          </button>
        </FormAcao>
      </section>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">{ctx.usuario.temSenha ? 'Trocar a senha' : 'Criar uma senha'}</h2>
        <p className="text-sm text-zinc-500">Sem senha, você entra pelo link que chega no e-mail. Trocar a senha encerra as outras sessões.</p>
        <FormAcao acao="/api/auth/senha" limpar className="flex flex-wrap items-end gap-3">
          {ctx.usuario.temSenha ? (
            <label className="flex flex-col gap-1">
              <span className="rotulo">Senha atual</span>
              <input name="atual" type="password" required autoComplete="current-password" className="campo w-56" />
            </label>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="rotulo">Nova senha (8+ com letras e números)</span>
            <input name="nova" type="password" required minLength={8} autoComplete="new-password" className="campo w-56" />
          </label>
          <button type="submit" className="botao">
            Salvar senha
          </button>
        </FormAcao>
      </section>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Contas de que você participa</h2>
        <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {ctx.contas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {c.nome} <span className="text-zinc-500">({NOME_PAPEL[c.papel].toLowerCase()})</span>
              </span>
              {c.id === ctx.conta?.id ? (
                <span className="text-xs text-sky-600">conta ativa</span>
              ) : (
                <FormAcao acao="/api/auth/trocar-conta">
                  <input type="hidden" name="conta" value={c.id} />
                  <button type="submit" className="botao">
                    Usar esta conta
                  </button>
                </FormAcao>
              )}
            </li>
          ))}
          {!ctx.contas.length ? <li className="py-2 text-zinc-500">Nenhuma. Crie uma abaixo ou aceite um convite.</li> : null}
        </ul>
        {ctx.conta && ctx.papel !== 'responsavel' ? (
          <FormAcao acao="/api/equipe" confirmar={`Sair da conta ${ctx.conta.nome}?`}>
            <input type="hidden" name="acao" value="remover-membro" />
            <input type="hidden" name="usuario" value={ctx.usuario.id} />
            <button type="submit" className="text-xs text-red-600 underline-offset-2 hover:underline">
              Sair da conta {ctx.conta.nome}
            </button>
          </FormAcao>
        ) : null}
      </section>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Criar outra conta</h2>
        <p className="text-sm text-zinc-500">Para outra empresa (outro grupo de lotéricas). Você vira o responsável dela.</p>
        <FormAcao acao="/api/conta" limpar className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="acao" value="criar-conta" />
          <label className="flex flex-col gap-1">
            <span className="rotulo">Nome da conta</span>
            <input name="nome" required minLength={2} className="campo w-56" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Código da 1ª lotérica</span>
            <input name="codigo" required className="campo w-40" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo">Nome da lotérica</span>
            <input name="nome_loja" className="campo w-56" />
          </label>
          <button type="submit" className="botao">
            Criar
          </button>
        </FormAcao>
      </section>
    </div>
  );
}
