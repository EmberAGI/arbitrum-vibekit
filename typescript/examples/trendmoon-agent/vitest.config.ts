import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 120000, // 2 minutes for integration tests (getSocialAndMarketInsights can be slow)
    hookTimeout: 30000, // 30 seconds for beforeAll/afterAll
  },
});
