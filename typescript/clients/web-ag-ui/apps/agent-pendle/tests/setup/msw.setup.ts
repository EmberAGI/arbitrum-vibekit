import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { handlers } from '../mocks/handlers/index.js';

export const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({
    onUnhandledRequest: (request, print) => {
      const url = request.url;
      if (url.includes('localhost:8125')) {
        return;
      }
      print.error();
    },
  });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
