import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { handlers } from '../mocks/handlers/index.js';

// Create MSW server instance with all handlers
export const server = setupServer(...handlers);

// MSW server lifecycle management
beforeAll(() => {
  // Start the MSW server before running tests
  server.listen({
    onUnhandledRequest(request, print) {
      const url = new URL(request.url);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return;
      }

      // Log unhandled request for debugging
      const logLevel = process.env['LOG_LEVEL'] || 'none';
      if (logLevel !== 'none') {
        console.error(`[MSW] Unhandled ${request.method} request to ${request.url}`);
      }

      print.error();
      throw new Error(
        `[MSW] Unhandled ${request.method} request to ${request.url}. ` +
          'Record a mock or explicitly allow this host.',
      );
    },
  });
});

afterEach(() => {
  // Reset handlers between tests to prevent cross-test pollution
  server.resetHandlers();
});

afterAll(() => {
  // Clean up after all tests are done
  server.close();
});
