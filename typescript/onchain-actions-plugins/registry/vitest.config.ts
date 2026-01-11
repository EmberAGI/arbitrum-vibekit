import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.unit.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/polymarket-plugin/**/*.ts'],
      exclude: ['node_modules', 'dist', 'tests/**', '**/*.test.ts', '**/*.d.ts'],
    },
    testTimeout: 15000,
    hookTimeout: 15000,
    reporters: process.env['CI'] ? ['default', 'junit'] : ['default'],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
});
