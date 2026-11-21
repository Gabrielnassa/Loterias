import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**'],
    // Os testes dependem do fuso America/Sao_Paulo apenas via Intl; o processo roda em UTC
    // para garantir que nada dependa do fuso da máquina.
    env: { TZ: 'UTC' },
  },
});
