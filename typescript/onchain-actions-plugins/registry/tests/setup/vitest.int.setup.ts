// Integration test setup - WITH MSW (if needed), WITH test environment
// Environment variables can be loaded from .env.test file (optional)
import { beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import './vitest.base.setup.js';

// Load .env.test file if it exists (optional)
beforeAll(() => {
  try {
    const envTestPath = join(process.cwd(), '.env.test');
    const envContent = readFileSync(envTestPath, 'utf-8');
    const lines = envContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          // Only set if not already set (env vars take precedence)
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch {
    // .env.test file doesn't exist - that's okay, use public RPC URLs as fallback
  }

  // Integration test setup can be extended here
  // For example, MSW handlers for mocking external API calls
});
