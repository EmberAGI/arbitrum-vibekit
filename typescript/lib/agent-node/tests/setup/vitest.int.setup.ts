// Integration test setup - WITH MSW, WITH dummy API keys
// Environment variables are loaded via Node's native --env-file flag in package.json
import { beforeAll } from 'vitest';

import './vitest.base.setup.js';
import './msw.setup.js';

// Set dummy AI provider API key for integration tests if not already set
// This allows AIService to initialize without real API keys
// MSW will intercept actual HTTP calls to OpenRouter
beforeAll(() => {
  if (!process.env['OPENROUTER_API_KEY']) {
    process.env['OPENROUTER_API_KEY'] = 'test-dummy-key';
  }
});
