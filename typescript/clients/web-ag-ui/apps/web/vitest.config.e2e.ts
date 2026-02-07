import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const setupFiles = ['./tests/setup/vitest.setup.ts'];

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'e2e',
    globals: true,
    environment: 'node',
    setupFiles,
    globalSetup: ['./tests/setup/system.globalSetup.ts'],
    include: ['src/**/*.e2e.test.ts', 'tests/**/*.e2e.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage/e2e',
      reporter: ['text', 'lcov'],
    },
    typecheck: {
      tsconfig: './tsconfig.vitest.json',
    },
  },
});

