/**
 * Global Test Setup
 * Suppresses console output during tests for cleaner test results
 * Console logging is still available in production
 */

import { vi } from 'vitest';

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

// Suppress console output during tests
console.log = vi.fn();
console.error = vi.fn(); 
console.warn = vi.fn();
console.info = vi.fn();
console.debug = vi.fn();

// Export originals in case specific tests need to verify console output
export { originalConsole };