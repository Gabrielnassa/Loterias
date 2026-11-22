import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Listas para generateStaticParams (gravadas por scripts/gerar-dados.ts no build). */
export interface ParametrosDemo {
  lotericas: string[];
  aberturas: string[];
  sites: string[];
}

export function parametros(): ParametrosDemo {
  const p = join(process.cwd(), 'demo', 'parametros.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as ParametrosDemo) : { lotericas: [], aberturas: [], sites: [] };
}
