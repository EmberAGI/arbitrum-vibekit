import { afterAll, beforeAll } from 'vitest';

beforeAll(() => {
  process.env['NODE_ENV'] = 'test';

  const logLevel = process.env['LOG_LEVEL'] || 'none';

  if (logLevel !== 'debug') {
    global.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      debug: console.debug,
    };

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
  }
});

afterAll(() => {
  if (global.originalConsole) {
    console.log = global.originalConsole.log;
    console.error = global.originalConsole.error;
    console.warn = global.originalConsole.warn;
    console.debug = global.originalConsole.debug;
  }
});

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
