import { reconstruirHistorico, type HistoricoSerializado } from '@radar/core/simulacao';
import { FonteSimuladaRaioX } from '@/lib/dados';
import { aoVivo } from '@/lib/servico';
import { registrarEvento, siteDoSlug } from '@/lib/site';
import { carregarAvisosDemo } from './avisos-ativo';
import { carregarContasDemo } from './contas-ativo';
import { definirFonteDeDados } from './fonte-dados';

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export interface InfoDemo {
  geradoEm: Date;
  carregadoEm: Date;
}

let pronto: Promise<InfoDemo> | null = null;

export { avisar } from './aviso';

/**
 * Carrega o histórico simulado do build e instala os "servidores de mentira" no navegador:
 * fetch para /api/lotericas e /api/site/.../evento, sendBeacon e o EventSource do Ao vivo.
 * O relógio da demonstração começa no instante do build e anda junto com o relógio real.
 */
export function prepararDemo(): Promise<InfoDemo> {
  pronto ??= (async () => {
    const r = await fetch(`${BASE}/dados/historico.json`);
    if (!r.ok) throw new Error(`não consegui ler os dados da demonstração (${r.status})`);
    const json = (await r.json()) as HistoricoSerializado;
    const historico = reconstruirHistorico(json);
    const carregado = Date.now();
    const fonte = new FonteSimuladaRaioX(() => new Date(json.ate + (Date.now() - carregado)), Number.POSITIVE_INFINITY, { historicoPronto: historico });
    definirFonteDeDados(fonte);
    await carregarContasDemo();
    await carregarAvisosDemo();
    instalarServidorLocal(fonte);
    return { geradoEm: new Date(json.ate), carregadoEm: new Date(carregado) };
  })();
  return pronto;
}

function caminho(url: string): URL | null {
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    const p = u.pathname.startsWith(`${BASE}/api/`) ? u.pathname.slice(BASE.length) : u.pathname;
    return p.startsWith('/api/') ? new URL(p + u.search, window.location.origin) : null;
  } catch {
    return null;
  }
}

async function evento(fonte: FonteSimuladaRaioX, u: URL, corpo: string | null) {
  const m = /^\/api\/site\/([^/]+)\/evento$/.exec(u.pathname);
  if (!m || !corpo) return;
  const site = await siteDoSlug(fonte, m[1]!);
  const d = JSON.parse(corpo) as { tipo: 'visita' | 'whatsapp' | 'caixa' | 'carrinho'; visitante: string };
  if (site) await registrarEvento(fonte, site, { tipo: d.tipo, visitante: d.visitante });
}

/**
 * APIs do apps/web que também rodam no navegador (Fase 6: contas, equipe...): o mesmo código, com o
 * repositório em memória guardado no localStorage (demo/contas.ts).
 */
const API_LOCAIS: Record<string, () => Promise<unknown>> = {
  '/api/equipe': () => import('@/app/api/equipe/route'),
  '/api/conta': () => import('@/app/api/conta/route'),
  '/api/monitoradas': () => import('@/app/api/monitoradas/route'),
  '/api/notificacoes': () => import('@/app/api/notificacoes/route'),
  '/api/planos': () => import('@/app/api/planos/route'),
};

function instalarServidorLocal(fonte: FonteSimuladaRaioX) {
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
    const u = caminho(url);
    if (!u) return fetchOriginal(entrada, init);
    if (u.pathname === '/api/lotericas') {
      const lotericas = await fonte.buscar(u.searchParams.get('q') ?? '', Number(u.searchParams.get('limite')) || 20);
      return Response.json({ q: u.searchParams.get('q'), lotericas });
    }
    const api = API_LOCAIS[u.pathname];
    if (api) {
      const mod = (await api()) as Record<string, ((req: Request) => Promise<Response>) | undefined>;
      const metodo = (init?.method ?? 'GET').toUpperCase();
      const f = mod[metodo];
      if (!f) return Response.json({ erro: 'método não suportado' }, { status: 405 });
      return f(new Request(u, init));
    }
    if (u.pathname.startsWith('/api/site/')) {
      await evento(fonte, u, typeof init?.body === 'string' ? init.body : null);
      return new Response(null, { status: 204 });
    }
    return Response.json({ erro: 'esta função precisa do servidor e não roda na demonstração estática' }, { status: 501 });
  };
  const beacon = navigator.sendBeacon?.bind(navigator);
  navigator.sendBeacon = (url: string | URL, dados?: BodyInit | null) => {
    const u = caminho(url.toString());
    if (!u) return beacon ? beacon(url, dados) : false;
    if (dados instanceof Blob) void dados.text().then((t) => evento(fonte, u, t));
    else if (typeof dados === 'string') void evento(fonte, u, dados);
    return true;
  };
  // Ao vivo: em vez do SSE do servidor, recalcula no navegador a cada 5 s
  class EventSourceLocal extends EventTarget {
    onerror: ((e: Event) => void) | null = null;
    readyState = 1;
    private timer: ReturnType<typeof setInterval>;
    constructor(url: string) {
      super();
      const u = new URL(url, window.location.origin);
      const opcoes = { uf: u.searchParams.get('uf') ?? '', destaque: u.searchParams.get('destaque') ?? '' };
      const enviar = async () => {
        const d = await aoVivo(fonte, { ...(opcoes.uf ? { uf: opcoes.uf } : {}), ...(opcoes.destaque ? { destaque: opcoes.destaque } : {}) });
        this.dispatchEvent(new MessageEvent('leitura', { data: JSON.stringify(d) }));
      };
      void enviar();
      this.timer = setInterval(() => void enviar(), 5000);
    }
    close() {
      clearInterval(this.timer);
      this.readyState = 2;
    }
  }
  (window as unknown as { EventSource: unknown }).EventSource = EventSourceLocal;
}
