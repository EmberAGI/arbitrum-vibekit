import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createEmberLendingSharedEmberHttpHost,
  resolveEmberLendingSharedEmberBaseUrl,
} from './sharedEmberHttpHost.js';

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString());
}

describe('createEmberLendingSharedEmberHttpHost', () => {
  let server: Server;
  let baseUrl: string;
  let responseStatus: number;
  let responseBody: unknown;

  beforeEach(async () => {
    responseStatus = 200;
    responseBody = null;
    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        if (request.url !== '/jsonrpc') {
          response.writeHead(404);
          response.end();
          return;
        }

        response.writeHead(responseStatus, {
          'content-type': 'application/json; charset=utf-8',
        });
        response.end(
          JSON.stringify(
            responseBody ?? {
              ok: true,
              received: await readRequestBody(request),
            },
          ),
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

  it('posts JSON-RPC payloads to the Shared Ember jsonrpc endpoint and trims trailing slashes', async () => {
    const host = createEmberLendingSharedEmberHttpHost({
      baseUrl,
    });

    await expect(
      host.handleJsonRpc({
        jsonrpc: '2.0',
        id: 'rpc-shared-http-001',
        method: 'subagent.readPortfolioState.v1',
        params: {
          agent_id: 'ember-lending',
        },
      }),
    ).resolves.toEqual({
      ok: true,
      received: {
        jsonrpc: '2.0',
        id: 'rpc-shared-http-001',
        method: 'subagent.readPortfolioState.v1',
        params: {
          agent_id: 'ember-lending',
        },
      },
    });
  });

  it('throws when the Shared Ember sidecar returns a JSON-RPC error payload with HTTP 200', async () => {
    responseBody = {
      jsonrpc: '2.0',
      id: 'rpc-shared-http-error',
      error: {
        code: -32001,
        message: 'expected revision mismatch',
      },
    };

    const host = createEmberLendingSharedEmberHttpHost({
      baseUrl,
    });

    await expect(
      host.handleJsonRpc({
        jsonrpc: '2.0',
        id: 'rpc-shared-http-error',
        method: 'subagent.readPortfolioState.v1',
        params: {
          agent_id: 'ember-lending',
        },
      }),
    ).rejects.toThrow('expected revision mismatch');
  });

  it('normalizes the optional Shared Ember base URL from env', () => {
    expect(
      resolveEmberLendingSharedEmberBaseUrl({
        SHARED_EMBER_BASE_URL: 'http://127.0.0.1:4010/',
      }),
    ).toBe('http://127.0.0.1:4010');
    expect(resolveEmberLendingSharedEmberBaseUrl({})).toBeNull();
  });
});
