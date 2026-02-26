import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { handlers } from '../mocks/handlers/index.js';

export const server = setupServer(...handlers);

beforeAll(() => {
  const langGraphBaseUrl = (process.env['LANGGRAPH_DEPLOYMENT_URL'] ?? 'http://127.0.0.1:8125').replace(
    /\/$/,
    '',
  );

  server.listen({
    onUnhandledRequest: (request, print) => {
      const url = request.url;
      if (url.startsWith(langGraphBaseUrl)) {
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
