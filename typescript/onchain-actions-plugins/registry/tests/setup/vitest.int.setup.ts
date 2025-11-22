// Integration test setup - WITH MSW (if needed), WITH test environment
// Environment variables can be loaded from .env.test file (optional)
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import './vitest.base.setup.js';

// Load .env.test file synchronously when this module is imported (before test files load)
// This ensures env vars are available when test files read process.env at module load time
(function loadEnvTest() {
  // Try multiple locations for .env.test file
  const cwd = process.cwd();
  const possiblePaths = [
    join(cwd, '.env.test'), // Current working directory
    join(cwd, 'typescript/onchain-actions-plugins/registry/.env.test'), // From monorepo root
    join(cwd, 'registry/.env.test'), // If running from onchain-actions-plugins directory
  ];

  for (const envTestPath of possiblePaths) {
    try {
      if (existsSync(envTestPath)) {
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
        console.log(`Loaded .env.test from: ${envTestPath}`);
        return; // Successfully loaded, exit
      }
    } catch (error) {
      // Try next path
      continue;
    }
  }
  // .env.test file doesn't exist in any location - that's okay, use public RPC URLs as fallback
})();
