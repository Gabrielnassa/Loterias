import { parametros } from '@demo/parametros';
import { Rota } from '@demo/Rota';

export const dynamicParams = false;

export function generateStaticParams() {
  return parametros().lotericas.map((codigo) => ({ codigo }));
}

export default async function Pagina({ params }: { params: Promise<{ codigo: string }> }) {
  const p = await params;
  return <Rota rota="loterica" params={{ codigo: decodeURIComponent(p.codigo) }} />;
}
