import type { MetadataRoute } from 'next';
import { fonteDeDados } from '@/lib/fonte-dados';
import { sitesConhecidos } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** Sitemap só com os sites públicos das lotéricas (o painel não é indexado). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.RADAR_SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';
  const sites = await sitesConhecidos(fonteDeDados());
  return sites.map((s) => ({ url: `${base}/${s.slug}`, changeFrequency: 'hourly', priority: 0.8 }));
}
