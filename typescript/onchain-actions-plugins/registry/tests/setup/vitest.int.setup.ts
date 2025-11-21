// Integration test setup - WITH MSW (if needed), WITH test environment
// Environment variables are loaded via Node's native --env-file flag in package.json
import { beforeAll } from 'vitest';

import './vitest.base.setup.js';

// Integration test setup can be extended here
// For example, MSW handlers for mocking external API calls
beforeAll(() => {
  // Add any integration test setup here
});
