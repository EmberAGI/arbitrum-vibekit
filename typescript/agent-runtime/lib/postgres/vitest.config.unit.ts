import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit',
    globals: true,
    environment: 'node',
    include: ['src/**/*.unit.test.ts'],
    passWithNoTests: true,
  },
});
