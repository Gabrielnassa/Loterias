import { classificarRota, TELAS } from '@radar/core';
import { NextResponse, type NextRequest } from 'next/server';
import { modoContas, repositorioContas } from './lib/contas/ativo';
import { CABECALHO_CONTEXTO, codificarContexto, contextoDoToken, COOKIE_SESSAO, type ContextoSessao } from './lib/contas/sessao';

/**
 * Porteiro do painel (Fase 6). Com as contas ligadas:
 * - rotas públicas (entrar, cadastro, convite, webhooks, site da lotérica) passam;
 * - o resto exige sessão; cada tela exige a permissão (papel/telas do membro); sem permissão vai para
 *   /sem-permissao (API: 401/403 em JSON);
 * - o contexto da sessão segue para as páginas num cabeçalho interno (o do navegador é descartado);
 * - POST de outro site é recusado (Origin diferente), além do cookie SameSite=Lax.
 */
export async function middleware(req: NextRequest) {
  const caminho = req.nextUrl.pathname;
  const { acesso, tela } = classificarRota(caminho);
  const cab = new Headers(req.headers);
  cab.delete(CABECALHO_CONTEXTO);
  // iframe: o painel nunca abre dentro de outro site (clickjacking); o site público da lotérica pode,
  // nas origens de RADAR_EMBED_ORIGENS (o WordPress do dono)
  const origens = (process.env.RADAR_EMBED_ORIGENS ?? '').split(/\s+/).filter((o) => /^https?:\/\/[\w.-]+(:\d+)?$/.test(o)).join(' ');
  const quadro = `frame-ancestors 'self'${acesso === 'desconhecida' && origens ? ` ${origens}` : ''}`;
  const comQuadro = <T extends Response>(r: T): T => {
    r.headers.set('Content-Security-Policy', quadro);
    return r;
  };
  const seguir = () => comQuadro(NextResponse.next({ request: { headers: cab } }));
  if (modoContas() === 'desligado') return seguir();

  const api = caminho.startsWith('/api/');
  if (req.method !== 'GET' && req.method !== 'HEAD' && !caminho.startsWith('/api/webhooks/')) {
    const origem = req.headers.get('origin');
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    if (origem && host && new URL(origem).host !== host) return comQuadro(NextResponse.json({ erro: 'origem não permitida' }, { status: 403 }));
  }

  const token = req.cookies.get(COOKIE_SESSAO)?.value;
  let ctx: ContextoSessao | null = null;
  if (token && acesso !== 'desconhecida') ctx = await contextoDoToken(repositorioContas()!, token, new Date());
  if (ctx) cab.set(CABECALHO_CONTEXTO, codificarContexto(ctx));
  if (acesso === 'publica' || acesso === 'desconhecida') return seguir();

  if (!ctx) {
    if (api) return comQuadro(NextResponse.json({ erro: 'entre primeiro' }, { status: 401 }));
    const u = new URL('/entrar', req.url);
    u.searchParams.set('voltar', caminho + req.nextUrl.search);
    return comQuadro(NextResponse.redirect(u));
  }
  if (acesso === 'tela' && tela && ctx.bloqueadas.includes(tela.id)) {
    // o papel libera, mas o plano da conta não: quem cuida do plano vai para Planos; os outros, um aviso
    if (api) return comQuadro(NextResponse.json({ erro: `${tela.nome} não faz parte do plano ${ctx.plano?.nome ?? ''}` }, { status: 402 }));
    const u = new URL(ctx.telas.includes('plano') ? '/planos' : '/sem-permissao', req.url);
    u.searchParams.set('tela', tela.id);
    if (!ctx.telas.includes('plano')) u.searchParams.set('motivo', 'plano');
    return comQuadro(NextResponse.redirect(u));
  }
  if (acesso === 'tela' && tela && !ctx.telas.includes(tela.id)) {
    if (api) return comQuadro(NextResponse.json({ erro: `sem permissão para ${tela.nome}` }, { status: 403 }));
    // a página inicial manda para a 1ª tela liberada
    if (caminho === '/') {
      const primeira = TELAS.find((t) => ctx.telas.includes(t.id))?.rotas.find((r) => !r.startsWith('/api/'));
      return comQuadro(NextResponse.redirect(new URL(primeira ?? (ctx.conta ? '/sem-permissao' : '/conta'), req.url)));
    }
    const u = new URL('/sem-permissao', req.url);
    u.searchParams.set('tela', tela.id);
    return comQuadro(NextResponse.redirect(u));
  }
  return seguir();
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|sw\\.js|icones/).*)'],
};
