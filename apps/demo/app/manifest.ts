import { manifestoDoRadar } from '@/app/manifest';

export const dynamic = 'force-static';

/** PWA da demonstração (com o prefixo /Loterias do GitHub Pages). */
export default function manifest() {
  return manifestoDoRadar(process.env.NEXT_PUBLIC_BASE_PATH ?? '');
}
