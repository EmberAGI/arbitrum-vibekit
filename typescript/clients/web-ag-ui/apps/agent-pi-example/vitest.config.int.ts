import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    globals: true,
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    passWithNoTests: true,
  },
});
