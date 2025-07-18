import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

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
