import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const setupFiles = ['./tests/setup/vitest.setup.ts'];

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'integration',
    globals: true,
    environment: 'node',
    setupFiles,
    include: ['src/**/*.int.test.ts', 'src/**/*.int.test.tsx', 'tests/**/*.int.test.ts'],
    passWithNoTests: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    typecheck: {
      tsconfig: './tsconfig.vitest.json',
    },
  },
});
