import { defineConfig } from 'vitest/config';

const setupFiles = ['./tests/setup/vitest.setup.ts'];

export default defineConfig({
  test: {
    name: 'e2e',
    globals: true,
    environment: 'node',
    setupFiles,
    include: ['tests/workflow/**/*.e2e.test.ts'],
    passWithNoTests: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    maxConcurrency: 1,
    minWorkers: 1,
  },
});
