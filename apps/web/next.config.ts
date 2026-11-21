import type { NextConfig } from 'next';

const config: NextConfig = {
  // @radar/core é publicado como TypeScript dentro do monorepo
  transpilePackages: ['@radar/core', '@radar/db'],
  serverExternalPackages: ['postgres', '@resvg/resvg-js'],
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default config;
