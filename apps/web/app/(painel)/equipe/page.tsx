import { NOME_PAPEL, TELAS, telasEfetivas, type Papel } from '@radar/core';
import { EscolherLojas, EscolherTelas } from '@/components/EscolherTelas';
import { FormAcao, MensagemDaConsulta } from '@/components/FormAcao';
import { repositorioContas } from '@/lib/contas/ativo';
import { painelEquipe } from '@/lib/contas/equipe';
import { contexto } from '@/lib/contexto';
import { fmtDataCurta, fmtMoeda } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Equipe e lojas' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const ESTADO: Record<string, string> = { pendente: 'aguardando', aceito: 'aceito', expirado: 'venceu', cancelado: 'cancelado' };

export default async function Equipe({ searchParams }: Props) {
  const sp = await searchParams;
  const repo = repositorioContas();
  const ctx = await contexto();
  if (!repo || !ctx?.conta) {
    return (
      <div className="cartao space-y-2 text-sm">
        <h1 className="text-lg font-semibold">Equipe e lojas</h1>
        <p>As contas estão desligadas (sem banco). Defina DATABASE_URL para ligar o login, a equipe e as permissões; para testar sem banco, RADAR_AUTH=memoria.</p>
      </div>
    );
  }
  const p = await painelEquipe(repo, ctx, new Date());
  const gestor = p.papel !== 'colaborador';
  const papeisConvite: Papel[] = p.papel === 'responsavel' ? ['colaborador', 'socio'] : ['colaborador'];
  const nomeTela = (id: string) => TELAS.find((t) => t.id === id)?.nome.split(' (')[0] ?? id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Equipe e lojas</h1>
        <p className="text-sm text-zinc-500">
          Conta {p.conta.nome} · você é {NOME_PAPEL[p.papel].toLowerCase()}
        </p>
      </div>
      <MensagemDaConsulta ok={sp.ok} erro={sp.erro} />

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Lotéricas da conta</h2>
        <div className="overflow-x-auto">
          <table className="tabela min-w-[560px]">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th className="text-right">Franquia diária</th>
                <th />
              </tr>
            </thead>
            <tbody className="tabular">
              {p.lojas.map((l) => (
                <tr key={l.codigo}>
                  <td>{l.codigo}</td>
                  <td>
                    {l.nome}
                    {!l.verificadaEm ? <span className="ml-2 text-xs text-amber-600" title="A titularidade da lotérica ainda não foi verificada">não verificada</span> : null}
                  </td>
                  <td className="text-right">{fmtMoeda(l.franquiaLimite)}</td>
                  <td className="text-right">
                    {gestor && p.lojas.length > 1 ? (
                      <FormAcao acao="/api/equipe" confirmar={`Tirar ${l.nome} da conta?`}>
                        <input type="hidden" name="acao" value="remover-loja" />
                        <input type="hidden" name="codigo" value={l.codigo} />
                        <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                          remover
                        </button>
                      </FormAcao>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {gestor ? (
          <FormAcao acao="/api/equipe" limpar className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="acao" value="salvar-loja" />
            <label className="flex flex-col gap-1">
              <span className="rotulo">Código</span>
              <input name="codigo" required placeholder="2894 ou 21.002894-7" className="campo w-44" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="rotulo">Nome</span>
              <input name="nome" placeholder="Loja Centro" className="campo w-52" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="rotulo">Franquia (R$)</span>
              <input name="franquia" inputMode="decimal" defaultValue="8000" className="campo w-28" />
            </label>
            <button type="submit" className="botao">
              Adicionar ou atualizar
            </button>
          </FormAcao>
        ) : null}
      </section>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Pessoas</h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {p.membros.map((m) => (
            <li key={m.usuarioId} className="space-y-2 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-medium">{m.usuario.nome}</span> <span className="text-sm text-zinc-500">{m.usuario.email}</span>
                  {m.euMesmo ? <span className="ml-2 text-xs text-sky-600">você</span> : null}
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{NOME_PAPEL[m.papel]}</span>
              </div>
              <p className="text-xs text-zinc-500">
                {m.papel === 'colaborador'
                  ? `Telas: ${telasEfetivas(m).map(nomeTela).join(', ') || 'nenhuma'}${m.lojas ? ` · Lojas: ${m.lojas.join(', ')}` : ''}`
                  : m.papel === 'responsavel'
                    ? 'Tudo, inclusive equipe e plano.'
                    : 'Tudo, menos o plano; gerencia colaboradores.'}
              </p>
              {m.gerenciavel ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-sky-700 dark:text-sky-400">Alterar papel e permissões</summary>
                  <FormAcao acao="/api/equipe" className="mt-3 space-y-3">
                    <input type="hidden" name="acao" value="alterar-membro" />
                    <input type="hidden" name="usuario" value={m.usuarioId} />
                    <label className="flex flex-col gap-1">
                      <span className="rotulo">Papel</span>
                      <select name="papel" defaultValue={m.papel} className="campo w-64">
                        <option value="colaborador">Colaborador (só as telas marcadas)</option>
                        {p.papel === 'responsavel' ? <option value="socio">Sócio (tudo, menos o plano)</option> : null}
                        {p.papel === 'responsavel' ? <option value="responsavel">Responsável (transferir a conta)</option> : null}
                      </select>
                    </label>
                    <EscolherTelas marcadas={m.telas} />
                    <EscolherLojas lojas={p.lojas} marcadas={m.lojas} />
                    <button type="submit" className="botao">
                      Salvar
                    </button>
                  </FormAcao>
                  <FormAcao acao="/api/equipe" confirmar={`Remover ${m.usuario.nome} da conta?`} className="mt-3">
                    <input type="hidden" name="acao" value="remover-membro" />
                    <input type="hidden" name="usuario" value={m.usuarioId} />
                    <button type="submit" className="text-xs text-red-600 underline-offset-2 hover:underline">
                      Remover da conta
                    </button>
                  </FormAcao>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {gestor ? (
        <section className="cartao space-y-4">
          <h2 className="font-semibold">Convidar</h2>
          <FormAcao acao="/api/equipe" limpar className="space-y-3">
            <input type="hidden" name="acao" value="convidar" />
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="rotulo">E-mail</span>
                <input name="email" type="email" required className="campo w-72" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="rotulo">Papel</span>
                <select name="papel" className="campo">
                  {papeisConvite.map((x) => (
                    <option key={x} value={x}>
                      {NOME_PAPEL[x]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <details className="text-sm" open>
              <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">Telas e lojas do colaborador</summary>
              <div className="mt-3 space-y-3">
                <EscolherTelas />
                <EscolherLojas lojas={p.lojas} />
              </div>
            </details>
            <button type="submit" className="botao">
              Enviar convite
            </button>
            <p className="text-xs text-zinc-500">O convite vale 7 dias. Também dá para copiar o link e mandar pelo WhatsApp.</p>
          </FormAcao>
          {p.convites.length ? (
            <div className="overflow-x-auto">
              <table className="tabela min-w-[560px]">
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>Papel</th>
                    <th>Enviado</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {p.convites.map((c) => (
                    <tr key={c.id}>
                      <td>{c.email}</td>
                      <td>{NOME_PAPEL[c.papel]}</td>
                      <td className="tabular">{fmtDataCurta(c.criadoEm)}</td>
                      <td>{ESTADO[c.estado]}</td>
                      <td className="text-right">
                        {c.estado === 'pendente' ? (
                          <FormAcao acao="/api/equipe">
                            <input type="hidden" name="acao" value="cancelar-convite" />
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                              cancelar
                            </button>
                          </FormAcao>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {p.papel === 'responsavel' ? (
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Nome da conta</h2>
          <FormAcao acao="/api/equipe" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="acao" value="renomear" />
            <input name="nome" defaultValue={p.conta.nome} required minLength={2} className="campo w-72" />
            <button type="submit" className="botao">
              Salvar
            </button>
          </FormAcao>
        </section>
      ) : null}

      <section className="cartao text-sm text-zinc-600 dark:text-zinc-400">
        <h2 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">Papéis</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong>Responsável</strong>: dono da conta; vê tudo, cuida da equipe, das lojas e do plano. Só existe um (dá para transferir).
          </li>
          <li>
            <strong>Sócio</strong>: vê tudo, inclusive o financeiro; convida e gerencia colaboradores; não mexe no plano.
          </li>
          <li>
            <strong>Colaborador</strong>: só as telas (e, se quiser, as lojas) marcadas aqui.
          </li>
        </ul>
      </section>
    </div>
  );
}
