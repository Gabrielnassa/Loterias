import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // integração usa um banco real: um arquivo por vez
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
