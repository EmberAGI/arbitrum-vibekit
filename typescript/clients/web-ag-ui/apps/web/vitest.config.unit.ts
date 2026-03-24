import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const setupFiles = ['./tests/setup/vitest.setup.ts'];

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'unit',
    globals: true,
    environment: 'node',
    setupFiles,
    passWithNoTests: true,
    include: ['src/**/*.unit.test.ts', 'src/**/*.unit.test.tsx', 'tests/**/*.unit.test.ts', 'tests/**/*.unit.test.tsx'],
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
