import { defineConfig } from 'vitest/config';

const setupFiles = ['./tests/setup/vitest.setup.ts'];

export default defineConfig({
  test: {
    name: 'integration',
    globals: true,
    environment: 'node',
    setupFiles,
    include: ['tests/**/*.int.test.ts'],
    passWithNoTests: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    typecheck: {
      tsconfig: './tsconfig.vitest.json',
    },
  },
});
