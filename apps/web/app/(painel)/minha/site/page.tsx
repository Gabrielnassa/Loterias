import { Grafico } from '@/components/Grafico';
import { Indisponivel } from '@/components/Indisponivel';
import { Kpi } from '@/components/Kpi';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtDataCurta, fmtInt, fmtPct } from '@/lib/formato';
import { minhaLoterica, MinhaIndisponivel } from '@/lib/minha';
import { metricasDoSiteNoPeriodo, sitesConhecidos } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Meu site' };

export default async function MeuSite({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const fonte = fonteDeDados();
  let loja;
  try {
    loja = await minhaLoterica(fonte, sp.loja ?? null);
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return <Indisponivel mensagem={e.message} />;
    throw e;
  }
  const site = (await sitesConhecidos(fonte)).find((s) => s.loterica.codigoCaixa === loja.codigoCaixa);
  if (!site) return <Indisponivel mensagem="Sem site para esta lotérica: o nome não gera um endereço válido. Cadastre um slug." />;
  const m = await metricasDoSiteNoPeriodo(fonte, site, 30);
  const editavel = fonte.tipo === 'postgres';
  return (
    <div className="space-y-6">
      <section className="cartao space-y-2">
        <h2 className="text-lg font-semibold">Seu site público</h2>
        <p className="text-sm">
          Endereço:{' '}
          <a className="link" href={`/${site.slug}`} target="_blank" rel="noopener noreferrer">
            /{site.slug}
          </a>{' '}
          · temas:{' '}
          {(['classico', 'noite', 'sorte'] as const).map((t) => (
            <a key={t} className="link mr-2" href={`/${site.slug}?tema=${t}`} target="_blank" rel="noopener noreferrer">
              {t}
            </a>
          ))}
        </p>
        <p className="text-xs text-zinc-500">Configuração: {site.origem === 'banco' ? 'banco' : site.origem === 'configuracao' ? 'variável RADAR_SITES' : 'padrão (complete abaixo)'}.</p>
      </section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi rotulo="Visitas (30 dias)" valor={fmtInt(m.visitas)} />
        <Kpi rotulo="Pessoas" valor={fmtInt(m.pessoas)} detalhe="navegadores distintos (anônimo)" />
        <Kpi rotulo="Cliques WhatsApp" valor={fmtInt(m.whatsapp)} />
        <Kpi rotulo="Cliques CAIXA" valor={fmtInt(m.caixa)} />
        <Kpi rotulo="Carrinho" valor={fmtInt(m.carrinho)} detalhe={`conversão ${fmtPct(m.conversao)}`} />
      </div>
      <section className="cartao">
        <Grafico titulo="Visitas por dia" tipo="barras" rotulos={m.porDia.map((d) => fmtDataCurta(d.dia))} series={[{ nome: 'visitas', valores: m.porDia.map((d) => d.visitas), cor: 'text-sky-500' }, { nome: 'WhatsApp', valores: m.porDia.map((d) => d.whatsapp), cor: 'text-emerald-500' }]} />
      </section>
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Dados do site</h2>
        {!editavel ? <p className="text-sm text-amber-700 dark:text-amber-400">Para editar, ligue o banco (DATABASE_URL). Na simulação vale a variável RADAR_SITES.</p> : null}
        <form method="post" action={`/api/minha/site?loja=${loja.codigoCaixa}`} className="grid gap-3 md:grid-cols-2">
          {(
            [
              ['slug', 'Endereço (slug)', site.slug],
              ['whatsapp', 'WhatsApp (com DDD)', site.whatsapp ?? ''],
              ['instagram', 'Instagram (sem @)', site.instagram ?? ''],
              ['endereco', 'Endereço da loja', site.endereco ?? ''],
              ['horario', 'Horário (ex.: Mo-Fr 08:00-18:00)', site.horario ?? ''],
            ] as const
          ).map(([nome, rotulo, valor]) => (
            <label key={nome} className="flex flex-col gap-1">
              <span className="rotulo">{rotulo}</span>
              <input name={nome} defaultValue={valor} className="campo" disabled={!editavel} />
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="rotulo">Tema</span>
            <select name="tema" defaultValue={site.tema} className="campo" disabled={!editavel}>
              <option value="classico">Clássico (claro)</option>
              <option value="noite">Noite (escuro)</option>
              <option value="sorte">Sorte (verde)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="rotulo">Sobre a lotérica</span>
            <textarea name="sobre" defaultValue={site.sobre ?? ''} rows={3} className="campo" disabled={!editavel} />
          </label>
          <div>
            <button className="botao" type="submit" disabled={!editavel}>
              Salvar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
