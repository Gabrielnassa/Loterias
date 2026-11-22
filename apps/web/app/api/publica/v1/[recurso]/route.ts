import { normalizarCodigoLoterica, slugDoNome } from '@radar/core';
import { repositorioContas } from '@/lib/contas/ativo';
import { autenticarChave, chaveDaRequisicao, ErroChave, type AcessoApi } from '@/lib/contas/chaves-api';
import { fonteDeDados } from '@/lib/fonte-dados';
import { lerCriterio, lerEscopo, lerSemanas, fichaAberturas, rankingPeriodo } from '@/lib/servico';
import { boloesDoSite, sitesConhecidos, type ConfigSite } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * API pública v1 (com chave), para o plugin WordPress e outras integrações:
 *   GET /api/publica/v1/conta                 lojas da conta, links do painel e dos sites públicos
 *   GET /api/publica/v1/raio-x?loterica=2894  Raio-X de Abertura de uma lotérica (semanas=4)
 *   GET /api/publica/v1/ranking?uf=SP         ranking da abertura (cidade, semanas, criterio, limite)
 *   GET /api/publica/v1/boloes?loja=2894      bolões à venda de uma loja DA CONTA (o mesmo do site público)
 * Números de terceiros são ESTIMATIVAS a partir da vitrine pública (o campo "aviso" diz isso).
 */
const AVISO = 'Estimativas a partir de leituras periódicas da vitrine pública do Marketplace da CAIXA; não são dados oficiais.';

function json(dados: unknown, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, max-age=60', 'access-control-allow-origin': '*' },
  });
}

async function lojasDoAcesso(a: AcessoApi): Promise<{ codigo: string; nome: string }[]> {
  if (a.tipo === 'instalacao') return (await fonteDeDados().minhasLotericas()).map((l) => ({ codigo: l.codigoCaixa, nome: l.nome }));
  return (await repositorioContas()!.lojas(a.contaId)).map((l) => ({ codigo: l.codigo, nome: l.nome }));
}

const base = (req: Request) => process.env.RADAR_SITE_URL?.replace(/\/+$/, '') ?? new URL(req.url).origin;

export async function GET(req: Request, { params }: { params: Promise<{ recurso: string }> }) {
  const { recurso } = await params;
  const s = new URL(req.url).searchParams;
  let acesso: AcessoApi;
  try {
    acesso = await autenticarChave(repositorioContas(), chaveDaRequisicao(req));
  } catch (e) {
    if (e instanceof ErroChave) return json({ erro: e.message }, (e as ErroChave & { status?: number }).status ?? 401);
    throw e;
  }
  const fonte = fonteDeDados();
  const lojas = await lojasDoAcesso(acesso);
  const sites = await sitesConhecidos(fonte);
  const siteDa = (codigo: string) => sites.find((x) => x.loterica.codigoCaixa === codigo) ?? null;

  switch (recurso) {
    case 'conta': {
      const conta = acesso.tipo === 'conta' ? await repositorioContas()!.conta(acesso.contaId) : null;
      return json({
        conta: conta?.nome ?? null,
        painel: `${base(req)}/entrar`,
        lojas: lojas.map((l) => ({ ...l, site: siteDa(l.codigo) ? `${base(req)}/${siteDa(l.codigo)!.slug}` : null })),
      });
    }
    case 'raio-x': {
      const codigo = normalizarCodigoLoterica(s.get('loterica') ?? '') ?? s.get('loterica') ?? lojas[0]?.codigo;
      if (!codigo) return json({ erro: 'informe ?loterica=código' }, 400);
      const f = await fichaAberturas(fonte, codigo, { semanas: lerSemanas(s.get('semanas'), 4, 13), escopo: lerEscopo(s.get('escopo')) });
      if (!f) return json({ erro: 'lotérica não encontrada na vitrine' }, 404);
      return json({
        aviso: AVISO,
        loterica: f.loterica,
        semanas: f.filtro.semanas,
        resumo: f.resumo,
        tendencia: f.tendencia,
        chanceAmanha: f.chanceAmanha,
        porSemana: f.metricas.map((m) => ({ semana: m.semana, aberturas: m.aberturasOcorridas, participacoes: m.participacoes, atrasoMedianoS: m.atrasoMedianoS, melhorPosicao: m.melhorPosicao, pctPagina1: m.pctPagina1 })),
        ultimasEntradas: f.metricas.flatMap((m) => m.horarios).slice(-10).reverse(),
      });
    }
    case 'ranking': {
      const r = await rankingPeriodo(fonte, {
        ...(s.get('uf') ? { uf: s.get('uf')!.toUpperCase() } : {}),
        ...(s.get('cidade') ? { cidade: s.get('cidade')! } : {}),
        semanas: lerSemanas(s.get('semanas'), 4, 13),
        modalidade: 'todas',
        escopo: lerEscopo(s.get('escopo')),
        criterio: lerCriterio(s.get('criterio')),
      });
      const limite = Math.min(50, Math.max(1, Number(s.get('limite')) || 10));
      return json({ aviso: AVISO, de: r.de, ate: r.ate, criterio: r.criterio, linhas: r.linhas.slice(0, limite) });
    }
    case 'boloes': {
      const codigo = normalizarCodigoLoterica(s.get('loja') ?? '') ?? s.get('loja') ?? lojas[0]?.codigo;
      const loja = lojas.find((l) => l.codigo === codigo);
      if (!loja) return json({ erro: 'loja fora da conta desta chave' }, 403);
      const l = (await fonte.loterica(loja.codigo)) ?? { codigoCaixa: loja.codigo, nome: loja.nome, cidade: '', uf: '' };
      const site: ConfigSite = siteDa(loja.codigo) ?? { slug: slugDoNome(loja.nome), loterica: l, whatsapp: null, instagram: null, endereco: null, horario: null, sobre: null, tema: 'classico', linkCaixa: '', origem: 'padrao', siteId: null };
      const boloes = await boloesDoSite(fonte, site);
      return json({ loja: { ...loja, whatsapp: site.whatsapp, site: siteDa(loja.codigo) ? `${base(req)}/${site.slug}` : null }, boloes });
    }
    default:
      return json({ erro: 'recurso desconhecido: use conta, raio-x, ranking ou boloes' }, 404);
  }
}
