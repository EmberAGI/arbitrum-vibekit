import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPortfolioManagerSharedEmberHttpHost,
  resolvePortfolioManagerSharedEmberBaseUrl,
} from './sharedEmberHttpHost.js';

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString());
}

describe('createPortfolioManagerSharedEmberHttpHost', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        if (request.url !== '/jsonrpc') {
          response.writeHead(404);
          response.end();
          return;
        }

        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
        });
        response.end(
          JSON.stringify({
            ok: true,
            received: await readRequestBody(request),
          }),
        );
      })().catch((error: unknown) => {
        response.writeHead(500);
        response.end(error instanceof Error ? error.message : 'unknown error');
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/`;
  });

  afterEach(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it('posts JSON-RPC payloads to the sidecar jsonrpc endpoint and trims trailing slashes', async () => {
    const host = createPortfolioManagerSharedEmberHttpHost({
      baseUrl,
    });

    await expect(
      host.handleJsonRpc({
        jsonrpc: '2.0',
        id: 'rpc-shared-http-001',
        method: 'subagent.readPortfolioState.v1',
        params: {
          agent_id: 'portfolio-manager',
        },
      }),
    ).resolves.toEqual({
      ok: true,
      received: {
        jsonrpc: '2.0',
        id: 'rpc-shared-http-001',
        method: 'subagent.readPortfolioState.v1',
        params: {
          agent_id: 'portfolio-manager',
        },
      },
    });
  });

  it('normalizes the optional Shared Ember base URL from env', () => {
    expect(
      resolvePortfolioManagerSharedEmberBaseUrl({
        SHARED_EMBER_BASE_URL: 'http://127.0.0.1:4010/',
      }),
    ).toBe('http://127.0.0.1:4010');
    expect(resolvePortfolioManagerSharedEmberBaseUrl({})).toBeNull();
  });
});
