import type { ReactNode } from 'react';

/** Página do apps/web: função assíncrona (componente de servidor) chamada no navegador. */
type Pagina = (props: { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string | undefined>> }) => ReactNode | Promise<ReactNode>;
type Layout = (props: { children: ReactNode }) => ReactNode | Promise<ReactNode>;
type Carregar<T> = () => Promise<{ default: T }>;

const minha: Carregar<Layout> = () => import('@/app/(painel)/minha/layout') as Promise<{ default: Layout }>;

/** As telas do sistema que rodam na demonstração (mesmo código do apps/web). */
export const ROTAS = {
  inicio: { pagina: () => import('@/app/(painel)/page') },
  abertura: { pagina: () => import('@/app/(painel)/aberturas/[id]/page') },
  'ao-vivo': { pagina: () => import('@/app/(painel)/ao-vivo/page') },
  calendario: { pagina: () => import('@/app/(painel)/calendario/page') },
  comparar: { pagina: () => import('@/app/(painel)/comparar/page') },
  estatisticas: { pagina: () => import('@/app/(painel)/estatisticas/page') },
  'estatisticas-lotericas': { pagina: () => import('@/app/(painel)/estatisticas/lotericas/page') },
  'ficha-loterica': { pagina: () => import('@/app/(painel)/estatisticas/lotericas/[codigo]/page') },
  loteca: { pagina: () => import('@/app/(painel)/loteca/page') },
  loterica: { pagina: () => import('@/app/(painel)/lotericas/[codigo]/page') },
  'mega-da-virada': { pagina: () => import('@/app/(painel)/mega-da-virada/page') },
  mercado: { pagina: () => import('@/app/(painel)/mercado/page') },
  filas: { pagina: () => import('@/app/(painel)/mercado/filas/page') },
  ranking: { pagina: () => import('@/app/(painel)/ranking/page') },
  elite: { pagina: () => import('@/app/(painel)/elite/page') },
  simulador: { pagina: () => import('@/app/(painel)/simulador/page') },
  'minha-boloes': { pagina: () => import('@/app/(painel)/minha/boloes/page'), layout: minha },
  'minha-financeiro': { pagina: () => import('@/app/(painel)/minha/financeiro/page'), layout: minha },
  'minha-conferencia': { pagina: () => import('@/app/(painel)/minha/conferencia/page'), layout: minha },
  'minha-posicao': { pagina: () => import('@/app/(painel)/minha/posicao/page'), layout: minha },
  'minha-sugestoes': { pagina: () => import('@/app/(painel)/minha/sugestoes/page'), layout: minha },
  'minha-simulador': { pagina: () => import('@/app/(painel)/minha/simulador/page'), layout: minha },
  'minha-cronometro': { pagina: () => import('@/app/(painel)/minha/cronometro/page'), layout: minha },
  'minha-site': { pagina: () => import('@/app/(painel)/minha/site/page'), layout: minha },
  'minha-midias': { pagina: () => import('./Midias'), layout: minha },
  site: { pagina: () => import('@/app/(site)/[slug]/page') },
} satisfies Record<string, { pagina: () => Promise<unknown>; layout?: Carregar<Layout> }>;

export type ChaveRota = keyof typeof ROTAS;

export async function carregarRota(chave: ChaveRota): Promise<{ pagina: Pagina; layout: Layout | null }> {
  const r = ROTAS[chave] as { pagina: () => Promise<unknown>; layout?: Carregar<Layout> };
  const mod = (await r.pagina()) as { default: Pagina };
  return { pagina: mod.default, layout: r.layout ? (await r.layout()).default : null };
}
