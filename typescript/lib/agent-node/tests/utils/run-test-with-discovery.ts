#!/usr/bin/env tsx
/**
 * Run a specific test with request discovery enabled
 *
 * This script runs the a2a-client-protocol test with MSW in passthrough mode
 * to identify what HTTP requests need to be mocked.
 *
 * Usage: tsx tests/utils/run-test-with-discovery.ts
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Set up environment for discovery
const env = {
  ...process.env,
  // Disable MSW mocking - let requests pass through
  MSW_DISABLED: '1',
  // Enable debug logging
  DEBUG_TESTS: '1',
  // Use a dummy API key
  OPENROUTER_API_KEY: 'test-discovery-key',
  // Disable console suppression to see all logs
  NO_SUPPRESS_CONSOLE: '1',
};

console.log('=== Request Discovery Mode ===');
console.log('Running a2a-client-protocol.int.test.ts with request logging...\n');
console.log('This will show all HTTP requests made during the test.\n');
console.log("Note: Requests will fail without real API keys - that's expected.\n");
console.log('===============================\n');

// Run the specific test file with vitest
const vitestProcess = spawn(
  'tsx',
  [
    '--env-file=.env.test',
    './node_modules/vitest/vitest.mjs',
    'run',
    '--reporter=verbose',
    '--no-coverage',
    'tests/integration/a2a-client-protocol.int.test.ts',
  ],
  {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  },
);

vitestProcess.on('error', (error) => {
  console.error('Failed to start test process:', error);
  process.exit(1);
});

vitestProcess.on('exit', (code) => {
  console.log('\n=== Discovery Complete ===');
  console.log(`Test process exited with code: ${code}`);
  console.log('\nReview the HTTP requests above to understand what needs to be mocked.');
  console.log('Then update tests/utils/record-mocks.ts to record these endpoints.\n');
  process.exit(code || 0);
});
