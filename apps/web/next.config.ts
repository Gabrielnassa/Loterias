import type { NextConfig } from 'next';

const config: NextConfig = {
  // @radar/core é publicado como TypeScript dentro do monorepo
  transpilePackages: ['@radar/core', '@radar/db', '@radar/avisos'],
  serverExternalPackages: ['postgres', '@resvg/resvg-js', 'web-push', 'nodemailer'],
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default config;
