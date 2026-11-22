import { parametros } from '@demo/parametros';
import { Rota } from '@demo/Rota';

export const dynamicParams = false;

export function generateStaticParams() {
  return parametros().sites.map((slug) => ({ slug }));
}

export default async function Pagina({ params }: { params: Promise<{ slug: string }> }) {
  const p = await params;
  return <Rota rota="site" params={{ slug: decodeURIComponent(p.slug) }} />;
}
