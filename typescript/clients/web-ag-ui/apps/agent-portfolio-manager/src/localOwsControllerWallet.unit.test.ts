import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPortfolioManagerLocalOwsControllerWallet,
  resolvePortfolioManagerLocalOwsBaseUrl,
} from './localOwsControllerWallet.js';

describe('createPortfolioManagerLocalOwsControllerWallet', () => {
  let server: Server;
  let baseUrl: string;
  let responseStatus: number;
  let responseBody: unknown;

  beforeEach(async () => {
    responseStatus = 200;
    responseBody = null;
    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        if (request.url !== '/identity') {
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
              controller_wallet_address: '0x00000000000000000000000000000000000000c1',
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

  it('reads the controller wallet identity from the local OWS sidecar', async () => {
    const wallet = createPortfolioManagerLocalOwsControllerWallet({
      baseUrl,
    });

    await expect(wallet.readControllerWalletAddress()).resolves.toBe(
      '0x00000000000000000000000000000000000000c1',
    );
  });

  it('normalizes the optional local OWS base URL from env', () => {
    expect(
      resolvePortfolioManagerLocalOwsBaseUrl({
        PORTFOLIO_MANAGER_OWS_BASE_URL: 'http://127.0.0.1:4030/',
      }),
    ).toBe('http://127.0.0.1:4030');
    expect(resolvePortfolioManagerLocalOwsBaseUrl({})).toBeNull();
  });
});
