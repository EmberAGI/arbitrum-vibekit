import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { handlers } from '../mocks/handlers/index.js';

export const server = setupServer(...handlers);

beforeAll(() => {
  const langgraphBaseUrlRaw = process.env['LANGGRAPH_DEPLOYMENT_URL'] ?? 'http://localhost:8125';
  const langgraphBaseUrl = langgraphBaseUrlRaw.endsWith('/')
    ? langgraphBaseUrlRaw.slice(0, -1)
    : langgraphBaseUrlRaw;

  server.listen({
    onUnhandledRequest: (request, print) => {
      const url = request.url;
      // E2E tests talk to a live LangGraph dev server (spawned in globalSetup). We don't want
      // MSW to complain about those requests.
      if (url.startsWith(langgraphBaseUrl)) {
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
