// Base vitest setup - runs for all test types
import { beforeAll, afterAll } from 'vitest';

// Global setup
beforeAll(() => {
  // Set test environment flag
  process.env['NODE_ENV'] = 'test';

  // Control console output during tests via LOG_LEVEL
  // Supported values: 'none' (default), 'error', 'warn', 'debug'
  const logLevel = process.env['LOG_LEVEL'] || 'none';

  if (logLevel !== 'debug') {
    // Store original methods for restoration
    global.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      debug: console.debug,
    };

    // Suppress console methods based on log level
    switch (logLevel) {
      case 'error':
        // Show only errors
        console.log = () => {};
        console.warn = () => {};
        console.debug = () => {};
        // Keep console.error enabled
        break;
      case 'warn':
        // Show errors and warnings
        console.log = () => {};
        console.debug = () => {};
        // Keep console.error and console.warn enabled
        break;
      case 'none':
      default:
        // Suppress everything
        console.log = () => {};
        console.error = () => {};
        console.warn = () => {};
        console.debug = () => {};
        break;
    }
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
