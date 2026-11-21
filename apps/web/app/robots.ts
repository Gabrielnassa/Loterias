import type { MetadataRoute } from 'next';

/** Só os sites das lotéricas são indexados; o painel e a API não. */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.RADAR_SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/minha', '/mercado', '/estatisticas', '/ranking', '/comparar', '/ao-vivo', '/aberturas', '/lotericas', '/mega-da-virada'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
