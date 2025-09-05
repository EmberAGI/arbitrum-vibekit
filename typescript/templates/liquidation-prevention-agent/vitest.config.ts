import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import { join } from 'path';

// Load .env file specific to this template directory
dotenv.config({ path: join(__dirname, '.env') });

export default defineConfig({
  test: {
    // Include test files with .vitest.ts extension
    include: ['**/*.{test,spec,vitest}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Global test setup file to suppress console output
    // setupFiles: ['./test/test-setup.ts'],
    // Pass through environment variables that we need
    env: {
      ...process.env,
    },
    // Increase timeout for integration tests that may need time to import modules
    testTimeout: 90000, // 90 seconds
  },
});
