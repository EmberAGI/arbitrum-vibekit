import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import { join } from 'path';

// Load .env file specific to this template directory
dotenv.config({ path: join(__dirname, '.env') });

export default defineConfig({
  test: {
    // Include test files with .vitest.ts extension
    include: ['**/*.{test,spec,vitest}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Pass through environment variables that we need
    env: {
      ...process.env,
    },
  },
});
