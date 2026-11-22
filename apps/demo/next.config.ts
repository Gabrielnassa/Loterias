import { resolve } from 'node:path';
import type { NextConfig } from 'next';

/**
 * Demonstração ESTÁTICA (GitHub Pages): exporta HTML/JS/CSS, sem servidor. As páginas são as do
 * apps/web, executadas no navegador sobre o histórico simulado gerado no build
 * (scripts/gerar-dados.ts -> public/dados/historico.json). Módulos de servidor (banco, fs,
 * Satori) são trocados pelas versões de demo/ via `paths` do tsconfig.
 */
const basePath = process.env.DEMO_BASE_PATH ?? '/Loterias';

// site público de exemplo (endereço e WhatsApp fictícios; o número 55 00 ... não existe)
const SITES_DEMO = JSON.stringify([
  {
    codigo: '980011',
    whatsapp: '5500000000000',
    instagram: 'exemplo.loterica',
    endereco: 'Rua de Exemplo, 100 - Santana, São Paulo/SP',
    horario: 'Seg a Sáb, 8h às 19h',
    sobre: 'Lotérica fictícia da demonstração do Radar Lotérico.',
  },
]);

const config: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@radar/core'],
  experimental: { externalDir: true },
  // o typecheck da demo roda à parte (pnpm --filter @radar/demo typecheck)
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath, RADAR_SITES: SITES_DEMO, NEXT_PUBLIC_DEMO: '1' },
  poweredByHeader: false,
  webpack: (cfg: { module: { rules: unknown[] } }) => {
    cfg.module.rules.unshift({ test: /apps[\\/]web[\\/]app[\\/].*\.tsx?$/, enforce: 'pre', use: [{ loader: resolve(process.cwd(), 'demo/loader-sem-metadata.cjs') }] });
    return cfg;
  },
};

export default config;
