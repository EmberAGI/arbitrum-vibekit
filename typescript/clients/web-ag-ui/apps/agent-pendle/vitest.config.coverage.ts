import { defineConfig } from 'vitest/config';

const setupFiles = ['./tests/setup/vitest.setup.ts'];

export default defineConfig({
  test: {
    name: 'coverage',
    globals: true,
    environment: 'node',
    setupFiles,
    passWithNoTests: true,
    include: ['src/**/*.unit.test.ts', 'src/**/*.int.test.ts'],
    exclude: ['src/**/*.e2e.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
    },
    typecheck: {
      tsconfig: './tsconfig.vitest.json',
    },
  },
});
