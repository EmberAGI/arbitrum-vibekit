import http from 'node:http';
import { createPiExampleAgUiHandler, PI_EXAMPLE_AGENT_ID } from './agUiServer.js';
import { preparePiExampleServer } from './startup.js';

const { bootstrap, port, service } = await preparePiExampleServer();
const handler = createPiExampleAgUiHandler({
  agentId: PI_EXAMPLE_AGENT_ID,
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

  response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
  response.end(Buffer.from(await webResponse.arrayBuffer()));
});

server.listen(port, () => {
  console.log(
    [
      `agent-pi-example listening on http://127.0.0.1:${port}`,
      bootstrap
        ? `database=${bootstrap.databaseUrl} mode=${bootstrap.bootstrapPlan.mode} startedLocalDocker=${String(bootstrap.startedLocalDocker)}`
        : 'database=unknown',
    ].join(' '),
  );
});
