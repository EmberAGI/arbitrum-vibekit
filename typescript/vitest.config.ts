import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only include files ending in .vitest.ts to avoid conflicts with Mocha tests
    include: ['**/*.vitest.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/*.test.ts', // Explicitly exclude Mocha test files
    ],
    // Test environment
    environment: 'node',
    // Test timeout (2 minutes to match Mocha setup)
    testTimeout: 120000,
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.test.ts',
        '**/*.d.ts',
        'coverage/',
        '.pnpm-debug.log*',
      ],
    },
    // Pool options for better performance
    pool: 'forks',
    // Reporter configuration
    reporters: ['verbose', 'json'],
  },
});
