import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup/vitest.e2e.setup.ts'],
    include: ['tests/**/*.e2e.test.ts'],
    poolOptions: { threads: { singleThread: true } },
    maxConcurrency: 1,
  },
});
