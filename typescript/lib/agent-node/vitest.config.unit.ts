import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup/vitest.unit.setup.ts'],
    include: ['src/**/*.unit.test.ts'],
  },
});
