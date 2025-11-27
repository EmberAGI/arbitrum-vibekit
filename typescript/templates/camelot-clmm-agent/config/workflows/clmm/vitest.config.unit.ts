import { defineConfig } from 'vitest/config';

const setupFiles = ['./tests/setup/vitest.setup.ts'];

export default defineConfig({
  test: {
    name: 'unit',
    globals: true,
    environment: 'node',
    setupFiles,
    include: ['src/**/*.unit.test.ts'],
    exclude: ['src/**/*.int.test.ts', 'src/**/*.e2e.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage/unit',
      reporter: ['text', 'lcov'],
    },
    typecheck: {
      tsconfig: './tsconfig.vitest.json',
    },
  },
});
