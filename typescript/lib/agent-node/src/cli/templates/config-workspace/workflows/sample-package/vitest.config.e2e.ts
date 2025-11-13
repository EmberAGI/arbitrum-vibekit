import { defineConfig } from 'vitest/config';

const setupFiles = ['./tests/setup/vitest.setup.ts'];

export default defineConfig({
  test: {
    name: 'e2e',
    globals: true,
    environment: 'node',
    setupFiles,
    include: ['tests/**/*.e2e.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    maxConcurrency: 1,
    minWorkers: 1,
    typecheck: {
      tsconfig: './tsconfig.vitest.json',
    },
  },
});
