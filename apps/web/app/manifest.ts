import type { MetadataRoute } from 'next';

/** PWA: o painel pode ser instalado no celular e no computador (necessário para push no iPhone). */
export default function manifest(): MetadataRoute.Manifest {
  return manifestoDoRadar(process.env.NEXT_PUBLIC_BASE_PATH ?? '');
}

export function manifestoDoRadar(base: string): MetadataRoute.Manifest {
  return {
    name: 'Radar Lotérico',
    short_name: 'Radar',
    description: 'Raio-X de Abertura, vitrine do Marketplace e gestão da lotérica.',
    id: `${base}/`,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: 'standalone',
    background_color: '#0c1a2b',
    theme_color: '#0c1a2b',
    lang: 'pt-BR',
    icons: [
      { src: `${base}/icones/icone-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${base}/icones/icone-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${base}/icones/icone-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Notificações', url: `${base}/notificacoes` },
      { name: 'Ao vivo', url: `${base}/ao-vivo` },
      { name: 'Cronômetro', url: `${base}/minha/cronometro` },
    ],
  };
}
