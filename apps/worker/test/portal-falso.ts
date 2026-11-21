import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { horarioSP, type BolaoFonte } from '@radar/core';
import { codigoBolaoCaixa, paraItemBrutoCaixa, respostaBoloesCaixa } from '@radar/core/simulacao';

/**
 * Portal FALSO para testar o adaptador de navegador sem tocar na CAIXA. Imita só o necessário:
 *  - SPA com hash routes; sem o cookie `termosDeUso` vai para #/termos-de-uso ("Você tem mais de 18 anos?");
 *  - #/bolao-caixa/{modalidade} exige o cookie `logado` (senão volta para #/home);
 *  - #/bolao-caixa/{código numérico} funciona sem login (link público da lotérica);
 *  - a página pede a lista em /silce-servico-rest/rest/v1/{base64 do caminho}/?q=... — o `q` aqui é
 *    um esquema próprio do portal falso (o adaptador nunca o monta) — e mostra o botão "Seguinte".
 * As respostas usam a estrutura real do JSON da CAIXA (paraItemBrutoCaixa/respostaBoloesCaixa).
 */
export interface PortalFalso {
  url: string;
  requisicoesLista: { em: number; caminho: string; pagina: number; alvo: string }[];
  /** Próximas respostas forçadas da lista (status HTTP ou 'captcha'). */
  forcar: (number | 'captcha')[];
  fechar(): Promise<void>;
}

const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Portal falso</title></head><body>
<div id="app">carregando</div>
<script>
const API = '/silce-servico-rest/rest/v1/';
let estado = {};
const temCookie = (n) => document.cookie.split('; ').some((c) => c.startsWith(n + '='));
const render = (h) => { document.getElementById('app').innerHTML = h; };
async function rota() {
  const h = location.hash || '#/home';
  if (!temCookie('termosDeUso')) {
    if (h !== '#/termos-de-uso') { location.hash = '#/termos-de-uso'; return; }
    render('<p>Você tem mais de 18 anos?</p><button id="nao">Não</button><button id="sim">Sim</button>');
    document.getElementById('sim').onclick = () => { document.cookie = 'termosDeUso=1; path=/'; location.hash = '#/home'; };
    return;
  }
  const m = /^#\\/bolao-caixa\\/([\\w-]+)$/.exec(h);
  if (m) {
    const ehLoterica = /^\\d+$/.test(m[1]);
    if (!ehLoterica && !temCookie('logado')) { location.hash = '#/home'; return; }
    estado = { alvo: m[1], ehLoterica, pagina: 1 };
    return carregar();
  }
  render('<h1>Home</h1>');
}
async function carregar() {
  const caminho = estado.ehLoterica ? 'boloes/recuperar-boloes-disponiveis-link' : 'boloes/recuperar-boloes-disponiveis';
  const q = btoa(JSON.stringify({ alvo: estado.alvo, pagina: estado.pagina, r: Math.random() }));
  const r = await fetch(API + btoa(caminho) + '/?q=' + encodeURIComponent(q));
  if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) { render('<p>erro</p>'); return; }
  const j = await r.json();
  estado.ultima = j.payload.ultimaPagina;
  render('<ul>' + j.payload.cotas.map((c) => '<li>' + c.nomeFantasia + '</li>').join('') + '</ul>' +
    (estado.pagina > 1 ? '<button id="ant">Anterior</button>' : '') +
    (estado.pagina < estado.ultima ? '<button id="seg">Seguinte</button>' : ''));
  const s = document.getElementById('seg');
  if (s) s.onclick = () => { estado.pagina++; carregar(); };
  const a = document.getElementById('ant');
  if (a) a.onclick = () => { estado.pagina--; carregar(); };
}
window.addEventListener('hashchange', rota);
rota();
</script></body></html>`;

/** Vitrine fictícia da Mega-Sena 3089: `n` bolões de lotéricas de São Paulo em filas. */
export function vitrineFalsa(n = 75): { bolao: BolaoFonte; fila: number }[] {
  const r: { bolao: BolaoFonte; fila: number }[] = [];
  const nLot = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const lot = i % nLot;
    const fila = Math.floor(i / nLot) + 1;
    r.push({
      bolao: {
        idCaixa: codigoBolaoCaixa(2026, 11, 700000000 + i, 20000 + i),
        loterica: { codigoCaixa: String(990100 + lot), nome: `Loterica Teste ${lot}`, cidade: 'SAO PAULO', uf: 'SP' },
        modalidade: 'mega-sena',
        concurso: 3089,
        jogos: 4,
        dezenas: 9,
        cotasTotal: 100,
        cotasDisponiveis: 100 - (i % 7),
        valorCotaBase: 20.16,
      },
      fila,
    });
  }
  return r.sort((a, b) => a.fila - b.fila);
}

export async function iniciarPortalFalso(vitrine = vitrineFalsa()): Promise<PortalFalso> {
  const portal: Omit<PortalFalso, 'url' | 'fechar'> = { requisicoesLista: [], forcar: [] };
  const sorteioEm = horarioSP(2026, 11, 22, 21, 0);
  const servidor: Server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost');
    if (u.pathname === '/silce-web/' || u.pathname === '/silce-web/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(HTML);
    }
    const m = /^\/silce-servico-rest\/rest\/v1\/([^/]+)\/?$/.exec(u.pathname);
    if (m) {
      const caminho = Buffer.from(decodeURIComponent(m[1]!), 'base64').toString('utf8');
      const q = JSON.parse(Buffer.from(u.searchParams.get('q') ?? '', 'base64').toString('utf8') || '{}') as { alvo?: string; pagina?: number };
      const pagina = q.pagina ?? 1;
      portal.requisicoesLista.push({ em: Date.now(), caminho, pagina, alvo: q.alvo ?? '' });
      const f = portal.forcar.shift();
      if (f === 'captcha') {
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end('<html><div class="g-recaptcha"></div></html>');
      }
      if (typeof f === 'number') {
        res.writeHead(f, { 'content-type': 'application/json' });
        return res.end('{}');
      }
      const lista = /^\d+$/.test(q.alvo ?? '') ? vitrine.filter((v) => v.bolao.loterica.codigoCaixa === q.alvo) : vitrine;
      const itens = lista.slice((pagina - 1) * 30, pagina * 30).map((v) => paraItemBrutoCaixa(v.bolao, { fila: v.fila, sorteioEm }));
      res.writeHead(200, { 'content-type': 'application/json;charset=UTF-8' });
      return res.end(JSON.stringify(respostaBoloesCaixa(itens, { pagina, totalRegistros: lista.length, agora: new Date() })));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const { port } = servidor.address() as AddressInfo;
  return Object.assign(portal, {
    url: `http://127.0.0.1:${port}/silce-web/`,
    fechar: () => new Promise<void>((ok) => servidor.close(() => ok())),
  });
}

/** storageState de teste para o portal falso (no portal real, quem prepara é uma pessoa). */
export function sessaoFalsa(url: string, cookies: Record<string, string>) {
  const dominio = new URL(url).hostname;
  return {
    cookies: Object.entries(cookies).map(([name, value]) => ({
      name, value, domain: dominio, path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const,
    })),
    origins: [],
  };
}
