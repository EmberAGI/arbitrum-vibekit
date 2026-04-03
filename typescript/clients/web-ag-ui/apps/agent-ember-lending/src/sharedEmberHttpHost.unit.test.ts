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
  let lastRequestBody: unknown;

  beforeEach(async () => {
    responseStatus = 200;
    responseBody = null;
    lastRequestBody = null;
    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        if (request.url !== '/jsonrpc') {
          response.writeHead(404);
          response.end();
          return;
        }

        lastRequestBody = await readRequestBody(request);

        response.writeHead(responseStatus, {
          'content-type': 'application/json; charset=utf-8',
        });
        response.end(
          JSON.stringify(
            responseBody ?? {
              ok: true,
              received: lastRequestBody,
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

  it('routes committed outbox reads through jsonrpc and unwraps the outbox page', async () => {
    responseBody = {
      jsonrpc: '2.0',
      id: 'rpc-shared-http-outbox-read',
      result: {
        protocol_version: 'v1',
        revision: 7,
        consumer_id: 'ember-lending-recovery',
        acknowledged_through_sequence: 1,
        next_cursor: 3,
        has_more: false,
        events: [
          {
            protocol_version: 'v1',
            event_id: 'evt-request-execution-3',
            sequence: 3,
            aggregate: 'request',
            aggregate_id: 'req-ember-lending-001',
            event_type: 'requestExecution.completed.v1',
            committed_at: '2026-03-29T00:00:05Z',
            payload: {
              request_id: 'req-ember-lending-001',
              transaction_plan_id: 'txplan-ember-lending-001',
              status: 'confirmed',
            },
          },
        ],
      },
    };

    const host = createEmberLendingSharedEmberHttpHost({
      baseUrl,
    });

    await expect(
      host.readCommittedEventOutbox({
        protocol_version: 'v1',
        consumer_id: 'ember-lending-recovery',
        after_sequence: 0,
        limit: 100,
      }),
    ).resolves.toEqual({
      protocol_version: 'v1',
      revision: 7,
      consumer_id: 'ember-lending-recovery',
      acknowledged_through_sequence: 1,
      next_cursor: 3,
      has_more: false,
      events: [
        {
          protocol_version: 'v1',
          event_id: 'evt-request-execution-3',
          sequence: 3,
          aggregate: 'request',
          aggregate_id: 'req-ember-lending-001',
          event_type: 'requestExecution.completed.v1',
          committed_at: '2026-03-29T00:00:05Z',
          payload: {
            request_id: 'req-ember-lending-001',
            transaction_plan_id: 'txplan-ember-lending-001',
            status: 'confirmed',
          },
        },
      ],
    });

    expect(lastRequestBody).toMatchObject({
      jsonrpc: '2.0',
      method: 'readCommittedEventOutbox.v1',
      params: {
        consumer_id: 'ember-lending-recovery',
        after_sequence: 0,
        limit: 100,
      },
    });
  });

  it('routes committed outbox acknowledgements through jsonrpc and preserves outbox-shaped errors', async () => {
    responseBody = {
      jsonrpc: '2.0',
      id: 'rpc-shared-http-outbox-ack',
      result: {
        protocol_version: 'v1',
        revision: 7,
        error: {
          code: -32001,
          message: 'protocol_conflict: outbox acknowledgement cannot move backwards',
        },
      },
    };

    const host = createEmberLendingSharedEmberHttpHost({
      baseUrl,
    });

    await expect(
      host.acknowledgeCommittedEventOutbox({
        protocol_version: 'v1',
        consumer_id: 'ember-lending-recovery',
        delivered_through_sequence: 3,
      }),
    ).resolves.toEqual({
      protocol_version: 'v1',
      revision: 7,
      error: {
        code: -32001,
        message: 'protocol_conflict: outbox acknowledgement cannot move backwards',
      },
    });

    expect(lastRequestBody).toMatchObject({
      jsonrpc: '2.0',
      method: 'ackCommittedEventOutbox.v1',
      params: {
        consumer_id: 'ember-lending-recovery',
        delivered_through_sequence: 3,
      },
    });
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
