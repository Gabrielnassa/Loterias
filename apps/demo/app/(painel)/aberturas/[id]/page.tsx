import { parametros } from '@demo/parametros';
import { Rota } from '@demo/Rota';

export const dynamicParams = false;

export function generateStaticParams() {
  return parametros().aberturas.map((id) => ({ id }));
}

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  return <Rota rota="abertura" params={{ id: decodeURIComponent(p.id) }} />;
}
