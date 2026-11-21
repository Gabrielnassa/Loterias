import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BotaoAdicionar, Carrinho, LinkRastreado, RegistrarVisita } from '@/components/site/SiteCliente';
import { fonteDeDados } from '@/lib/fonte-dados';
import { fmtDataLonga, fmtHora, fmtInt, fmtMoeda, NOME_MODALIDADE } from '@/lib/formato';
import { boloesDoSite, siteDoSlug, TEMAS, type TemaSite } from '@/lib/site';
import { ehModalidade, filtrarBoloesDoSite, linkWhatsapp, MODALIDADES, type OrdemSite } from '@radar/core';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

const base = () => process.env.RADAR_SITE_URL?.replace(/\/$/, '') ?? '';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const site = await siteDoSlug(fonteDeDados(), slug);
  if (!site) return { title: 'Lotérica não encontrada' };
  const l = site.loterica;
  const onde = `${l.bairro ? `${l.bairro}, ` : ''}${l.cidade}/${l.uf}`;
  const titulo = `Bolões da ${l.nome} · ${onde}`;
  const descricao = `Cotas de bolões oficiais CAIXA (Mega-Sena, Lotofácil, Quina e mais) à venda na ${l.nome}${site.endereco ? `, ${site.endereco}` : `, em ${onde}`}. Reserve pelo WhatsApp ou compre no site da CAIXA.`;
  return {
    title: { absolute: titulo },
    description: descricao,
    ...(base() ? { metadataBase: new URL(base()), alternates: { canonical: `/${slug}` } } : {}),
    openGraph: { title: titulo, description: descricao, type: 'website', locale: 'pt_BR', siteName: l.nome },
    robots: { index: true, follow: true },
  };
}

export default async function SitePublico({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const fonte = fonteDeDados();
  const site = await siteDoSlug(fonte, slug);
  if (!site) notFound();
  const l = site.loterica;
  const temaAtivo: TemaSite = sp.tema && (TEMAS as string[]).includes(sp.tema) ? (sp.tema as TemaSite) : site.tema;
  const ordem: OrdemSite = sp.ordem === 'preco' || sp.ordem === 'restam' ? sp.ordem : 'concurso';
  const todos = await boloesDoSite(fonte, site);
  const boloes = filtrarBoloesDoSite(todos, { modalidade: sp.loteria && ehModalidade(sp.loteria) ? sp.loteria : null, valorMax: sp.ate ? Number(sp.ate) : null, ordem });
  const modalidades = [...new Set(todos.map((b) => b.modalidade))];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: l.nome,
    description: site.sobre ?? `Lotérica em ${l.cidade}/${l.uf} com bolões oficiais CAIXA.`,
    address: { '@type': 'PostalAddress', ...(site.endereco ? { streetAddress: site.endereco } : {}), addressLocality: l.cidade, addressRegion: l.uf, addressCountry: 'BR' },
    ...(site.whatsapp ? { telephone: `+${site.whatsapp}` } : {}),
    ...(site.horario ? { openingHours: site.horario } : {}),
    ...(base() ? { url: `${base()}/${slug}` } : {}),
    ...(site.instagram ? { sameAs: [`https://www.instagram.com/${site.instagram}`] } : {}),
  };
  const zap = site.whatsapp ? linkWhatsapp(site.whatsapp, `Olá, ${l.nome}! Quero saber dos bolões disponíveis.`) : null;
  return (
    <div className="site min-h-screen" data-tema={temaAtivo}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <RegistrarVisita slug={slug} />
      <Carrinho slug={slug} nome={l.nome} whatsapp={site.whatsapp}>
        <header className="mx-auto max-w-5xl space-y-3 px-4 pb-4 pt-8">
          <h1 className="text-3xl font-bold">{l.nome}</h1>
          <p className="site-suave">
            {site.endereco ?? `${l.bairro ? `${l.bairro}, ` : ''}${l.cidade}/${l.uf}`}
            {site.horario ? ` · ${site.horario}` : ''}
          </p>
          {site.sobre ? <p className="max-w-2xl">{site.sobre}</p> : null}
          <div className="flex flex-wrap gap-2">
            {zap ? (
              <LinkRastreado slug={slug} tipo="whatsapp" href={zap} className="site-botao">
                Falar no WhatsApp
              </LinkRastreado>
            ) : null}
            <LinkRastreado slug={slug} tipo="caixa" href={site.linkCaixa} className="site-botao-linha">
              Ver no site da CAIXA
            </LinkRastreado>
            {site.instagram ? (
              <a className="site-botao-linha" href={`https://www.instagram.com/${site.instagram}`} target="_blank" rel="noopener noreferrer">
                @{site.instagram}
              </a>
            ) : null}
          </div>
        </header>
        <main className="mx-auto max-w-5xl space-y-4 px-4 pb-40">
          <form method="get" className="site-cartao flex flex-wrap items-end gap-3 p-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="site-suave">Loteria</span>
              <select name="loteria" defaultValue={sp.loteria ?? ''} className="site-campo">
                <option value="">Todas</option>
                {modalidades.map((m) => (
                  <option key={m} value={m}>
                    {NOME_MODALIDADE[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="site-suave">Cota até</span>
              <select name="ate" defaultValue={sp.ate ?? ''} className="site-campo">
                <option value="">qualquer valor</option>
                {[10, 20, 50, 100].map((v) => (
                  <option key={v} value={v}>
                    R$ {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="site-suave">Ordem</span>
              <select name="ordem" defaultValue={ordem} className="site-campo">
                <option value="concurso">Sorteio mais próximo</option>
                <option value="preco">Menor preço</option>
                <option value="restam">Últimas cotas</option>
              </select>
            </label>
            {sp.tema ? <input type="hidden" name="tema" value={sp.tema} /> : null}
            <button className="site-botao" type="submit">
              Filtrar
            </button>
          </form>
          {boloes.length === 0 ? <p className="site-cartao site-suave p-6 text-center">Nenhum bolão à venda agora com esses filtros. Fale com a lotérica pelo WhatsApp.</p> : null}
          <div className="grid gap-3 md:grid-cols-2">
            {boloes.map((b) => (
              <article key={b.id} className="site-cartao space-y-2 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">
                    <span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ background: MODALIDADES[b.modalidade].cor }} />
                    {b.nomeModalidade} {b.concurso}
                  </h2>
                  <span className="text-xl font-bold tabular">
                    {fmtMoeda(b.valorCota)}
                    <span className="site-suave text-xs font-normal"> /cota</span>
                  </span>
                </div>
                <p className="site-suave text-sm">
                  {b.jogos} {b.jogos > 1 ? 'jogos' : 'jogo'} de {b.dezenas} números · restam {fmtInt(b.disponiveis)} de {fmtInt(b.cotasTotal)} cotas
                  {b.fechaEm ? ` · até ${fmtDataLonga(b.fechaEm).slice(0, 10)} ${fmtHora(b.fechaEm).slice(0, 5)}` : ''}
                </p>
                {b.chance.principalUmEm ? (
                  <p className="text-sm">
                    Chance do prêmio principal: <strong>1 em {fmtInt(b.chance.principalUmEm)}</strong>
                    {b.chance.algumPremioUmEm ? ` · algum prêmio: 1 em ${b.chance.algumPremioUmEm.toLocaleString('pt-BR')}` : ''}
                  </p>
                ) : null}
                {b.jogosNumeros ? (
                  <details className="text-sm">
                    <summary className="site-suave cursor-pointer">Ver os jogos{b.jogosDemonstracao ? ' (demonstração)' : ''}</summary>
                    <ol className="mt-1 space-y-0.5 font-mono text-xs">
                      {b.jogosNumeros.map((j, i) => (
                        <li key={i}>{j.map((n) => String(n).padStart(2, '0')).join(' ')}</li>
                      ))}
                    </ol>
                  </details>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <BotaoAdicionar id={b.id} modalidade={b.nomeModalidade} concurso={b.concurso} formato={b.formato} valorCota={b.valorCota} max={b.disponiveis} />
                  <LinkRastreado slug={slug} tipo="caixa" bolaoId={b.id} href={site.linkCaixa} className="site-botao-linha">
                    Comprar na CAIXA
                  </LinkRastreado>
                </div>
              </article>
            ))}
          </div>
          <footer className="site-suave space-y-1 pt-8 text-xs">
            <p>Bolões oficiais das Loterias CAIXA. O valor da cota inclui a tarifa de serviço de até 35%. Chances pelas tabelas oficiais (aproximadas para vários jogos).</p>
            <p>Aposte com responsabilidade. Proibido para menores de 18 anos.</p>
          </footer>
        </main>
      </Carrinho>
    </div>
  );
}
