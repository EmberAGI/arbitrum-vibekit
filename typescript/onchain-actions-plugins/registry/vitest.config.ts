import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['../../tests/setup/vitest.setup.ts'],
    include: ['src/**/*.unit.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 10000,
    hookTimeout: 10000,
    reporters: process.env['CI'] ? ['default', 'github-actions'] : ['default'],
    pool: 'forks',
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
});
