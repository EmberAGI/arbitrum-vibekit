import http from 'node:http';

import {
  createEmberLendingAgUiHandler,
  EMBER_LENDING_AGENT_ID,
} from './agUiServer.js';
import { prepareEmberLendingServer } from './startup.js';

const { port, service } = await prepareEmberLendingServer();
const handler = createEmberLendingAgUiHandler({
  agentId: EMBER_LENDING_AGENT_ID,
  service,
});

async function readRequestBody(request: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function toHeaders(headers: http.IncomingHttpHeaders): Headers {
  const result = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }
      continue;
    }

    if (typeof value === 'string') {
      result.set(key, value);
    }
  }

  return result;
}

async function writeNodeResponse(response: Response, target: http.ServerResponse): Promise<void> {
  target.writeHead(response.status, Object.fromEntries(response.headers.entries()));

  if (!response.body) {
    target.end();
    return;
  }

  const reader = response.body.getReader();

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      target.end();
      return;
    }

    target.write(Buffer.from(chunk.value));
  }
}

const server = http.createServer(async (request, response) => {
  const origin = `http://${request.headers.host ?? `127.0.0.1:${port}`}`;
  const url = new URL(request.url ?? '/', origin);
  const body = await readRequestBody(request);

  const webRequest = new Request(url, {
    method: request.method,
    headers: toHeaders(request.headers),
    body:
      request.method === 'GET' || request.method === 'HEAD' || body.length === 0
        ? undefined
        : new Uint8Array(body),
  });
  const webResponse = await handler(webRequest);
  await writeNodeResponse(webResponse, response);
});

server.listen(port, () => {
  console.log(`agent-ember-lending listening on http://127.0.0.1:${port}`);
});
