// Base vitest setup - runs for all test types
import { beforeAll, afterAll } from 'vitest';

// Global setup
beforeAll(() => {
  // Set test environment flag
  process.env['NODE_ENV'] = 'test';

  // Suppress console output during tests unless explicitly testing console
  if (!process.env['DEBUG_TESTS']) {
    // Store original methods for restoration
    global.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      debug: console.debug,
    };

    // Override console methods
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};
    console.debug = () => {};
  }
});

// Global teardown
afterAll(() => {
  // Restore console methods if they were overridden
  if (global.originalConsole) {
    console.log = global.originalConsole.log;
    console.error = global.originalConsole.error;
    console.warn = global.originalConsole.warn;
    console.debug = global.originalConsole.debug;
  }
});

// Extend global type definitions
declare global {
  var originalConsole:
    | {
        log: typeof console.log;
        error: typeof console.error;
        warn: typeof console.warn;
        debug: typeof console.debug;
      }
    | undefined;
}
