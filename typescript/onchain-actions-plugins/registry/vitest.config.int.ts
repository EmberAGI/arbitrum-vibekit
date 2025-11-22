import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup/vitest.int.setup.ts'],
    include: ['tests/**/*.int.test.ts'],
    testTimeout: 30000,
  },
});
