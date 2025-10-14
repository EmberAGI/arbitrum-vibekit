import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.int.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: Number(process.env.BRIDGE_TEST_TIMEOUT || 300000),
    hookTimeout: Number(process.env.BRIDGE_TEST_TIMEOUT || 300000),
    reporters: process.env['CI'] ? ['default', 'github-actions'] : ['default'],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
});


