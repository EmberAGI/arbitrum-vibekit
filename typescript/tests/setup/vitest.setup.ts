import { afterAll, beforeAll } from 'vitest';

declare global {
  // Allows us to stash the original console methods while tests run
  // eslint-disable-next-line no-var
  var originalConsole:
    | {
        log: typeof console.log;
        error: typeof console.error;
        warn: typeof console.warn;
        debug: typeof console.debug;
      }
    | undefined;
}

beforeAll(() => {
  // Given a deterministic test environment toggle
  process.env['NODE_ENV'] = 'test';

  // When evaluating log visibility for this run
  const logLevel = process.env['LOG_LEVEL'] ?? 'none';

  if (logLevel === 'debug') {
    return;
  }

  global.originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    debug: console.debug,
  };

  // Then suppress console noise according to the configured level
  switch (logLevel) {
    case 'error':
      console.log = () => {};
      console.warn = () => {};
      console.debug = () => {};
      break;
    case 'warn':
      console.log = () => {};
      console.debug = () => {};
      break;
    case 'none':
    default:
      console.log = () => {};
      console.error = () => {};
      console.warn = () => {};
      console.debug = () => {};
      break;
  }
});

afterAll(() => {
  // Given the test suite completed
  if (!global.originalConsole) {
    return;
  }

  // Then restore the original console implementations
  console.log = global.originalConsole.log;
  console.error = global.originalConsole.error;
  console.warn = global.originalConsole.warn;
  console.debug = global.originalConsole.debug;
  global.originalConsole = undefined;
});
