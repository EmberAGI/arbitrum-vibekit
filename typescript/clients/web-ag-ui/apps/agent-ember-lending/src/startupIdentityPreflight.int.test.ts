import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { importWalletPrivateKey } from '@open-wallet-standard/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEmberLendingGatewayService } from './agUiServer.js';

type StubRequest = {
  method: string;
  path: string;
  body: unknown;
};

type StubResponse = {
  status?: number;
  body?: unknown;
};

const TEST_OWS_PRIVATE_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_OWS_WALLET_ADDRESS = '0xfcad0b19bb29d4674531d6f115237e16afce377c' as const;

function createOwsWalletFixture(walletName: string) {
  const vaultPath = mkdtempSync(path.join(os.tmpdir(), 'ember-lending-ows-'));
  importWalletPrivateKey(walletName, TEST_OWS_PRIVATE_KEY, undefined, vaultPath, 'evm');

  return {
    walletAddress: TEST_OWS_WALLET_ADDRESS,
    env: {
      EMBER_LENDING_OWS_WALLET_NAME: walletName,
      EMBER_LENDING_OWS_VAULT_PATH: vaultPath,
    },
    cleanup() {
      rmSync(vaultPath, {
        recursive: true,
        force: true,
      });
    },
  };
}

function createEmptyOwsVaultFixture(walletName: string) {
  const vaultPath = mkdtempSync(path.join(os.tmpdir(), 'ember-lending-ows-empty-'));

  return {
    env: {
      EMBER_LENDING_OWS_WALLET_NAME: walletName,
      EMBER_LENDING_OWS_VAULT_PATH: vaultPath,
    },
    cleanup() {
      rmSync(vaultPath, {
        recursive: true,
        force: true,
      });
    },
  };
}

async function readRequestBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function startJsonStubServer(
  handler: (request: StubRequest) => Promise<StubResponse> | StubResponse,
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const rawBody = await readRequestBody(request);
      const body =
        rawBody.length === 0 ? null : (JSON.parse(Buffer.from(rawBody).toString('utf8')) as unknown);
      const result = await handler({
        method: request.method ?? 'GET',
        path: url.pathname,
        body,
      });

      response.statusCode = result.status ?? 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(result.body ?? null));
    })().catch((error: unknown) => {
      response.statusCode = 500;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          message: error instanceof Error ? error.message : 'unknown error',
        }),
      );
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

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
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
    },
  };
}

function createInternalPostgresHooks() {
  return {
    ensureReady: vi.fn(async () => ({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
    })),
    loadInspectionState: vi.fn(async () => ({
      threads: [],
      executions: [],
      automations: [],
      automationRuns: [],
      interrupts: [],
      leases: [],
      outboxIntents: [],
      executionEvents: [],
      threadActivities: [],
    })),
    executeStatements: vi.fn(async () => undefined),
    persistDirectExecution: vi.fn(async () => undefined),
  };
}

describe('ember-lending startup identity preflight integration', () => {
  const cleanupFns: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupFns.length > 0) {
      const cleanup = cleanupFns.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('writes the subagent identity through the live Shared Ember and direct OWS runtime wallet lookup before boot succeeds', async () => {
    const sharedEmberRequests: Array<Record<string, unknown>> = [];
    const owsWallet = createOwsWalletFixture('ember-lending-service-wallet');
    cleanupFns.push(async () => {
      owsWallet.cleanup();
    });

    const sharedEmber = await startJsonStubServer(async ({ path, body }) => {
      if (path !== '/jsonrpc') {
        return {
          status: 404,
          body: {
            message: 'not found',
          },
        };
      }

      const request =
        typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      sharedEmberRequests.push(request);

      if (request['method'] === 'orchestrator.readAgentServiceIdentity.v1') {
        return {
          body: {
            jsonrpc: '2.0',
            id: request['id'] ?? 'rpc-agent-service-identity-read',
            result: {
              protocol_version: 'v1',
              revision: 4,
              agent_service_identity: null,
            },
          },
        };
      }

      if (request['method'] === 'orchestrator.writeAgentServiceIdentity.v1') {
        const params =
          typeof request['params'] === 'object' && request['params'] !== null
            ? (request['params'] as Record<string, unknown>)
            : {};

        return {
          body: {
            jsonrpc: '2.0',
            id: request['id'] ?? 'rpc-agent-service-identity-write',
            result: {
              protocol_version: 'v1',
              revision: 5,
              agent_service_identity: params['agent_service_identity'] ?? null,
            },
          },
        };
      }

      return {
        status: 500,
        body: {
          message: `unexpected method ${String(request['method'])}`,
        },
      };
    });
    cleanupFns.push(sharedEmber.close);

    const service = await createEmberLendingGatewayService({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
        SHARED_EMBER_BASE_URL: sharedEmber.baseUrl,
        ...owsWallet.env,
      },
      __internalPostgres: createInternalPostgresHooks(),
    } as never);

    await expect(service.control.inspectHealth()).resolves.toMatchObject({
      status: 'ok',
    });

    expect(sharedEmberRequests).toHaveLength(2);
    expect(sharedEmberRequests[0]).toMatchObject({
      method: 'orchestrator.readAgentServiceIdentity.v1',
      params: {
        agent_id: 'ember-lending',
        role: 'subagent',
      },
    });
    expect(sharedEmberRequests[1]).toMatchObject({
      method: 'orchestrator.writeAgentServiceIdentity.v1',
      params: {
        expected_revision: 4,
        agent_service_identity: {
          agent_id: 'ember-lending',
          role: 'subagent',
          wallet_address: TEST_OWS_WALLET_ADDRESS,
          registration_version: 1,
        },
      },
    });
  });

  it('fails closed before boot succeeds when Shared Ember does not confirm the subagent identity write', async () => {
    const sharedEmberRequests: Array<Record<string, unknown>> = [];
    const sharedEmber = await startJsonStubServer(async ({ path, body }) => {
      if (path !== '/jsonrpc') {
        return {
          status: 404,
          body: {
            message: 'not found',
          },
        };
      }

      const request =
        typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      sharedEmberRequests.push(request);

      if (request['method'] === 'orchestrator.readAgentServiceIdentity.v1') {
        return {
          body: {
            jsonrpc: '2.0',
            id: request['id'] ?? 'rpc-agent-service-identity-read',
            result: {
              protocol_version: 'v1',
              revision: 4,
              agent_service_identity: null,
            },
          },
        };
      }

      if (request['method'] === 'orchestrator.writeAgentServiceIdentity.v1') {
        return {
          body: {
            jsonrpc: '2.0',
            id: request['id'] ?? 'rpc-agent-service-identity-write',
            result: {
              protocol_version: 'v1',
              revision: 5,
              agent_service_identity: null,
            },
          },
        };
      }

      return {
        status: 500,
        body: {
          message: `unexpected method ${String(request['method'])}`,
        },
      };
    });
    cleanupFns.push(sharedEmber.close);
    const owsWallet = createOwsWalletFixture('ember-lending-service-wallet');
    cleanupFns.push(async () => {
      owsWallet.cleanup();
    });

    await expect(
      createEmberLendingGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: sharedEmber.baseUrl,
          ...owsWallet.env,
        },
        __internalPostgres: createInternalPostgresHooks(),
      } as never),
    ).rejects.toThrow(
      'Lending startup identity preflight failed because Shared Ember did not confirm the expected subagent identity.',
    );

    expect(sharedEmberRequests).toHaveLength(2);
    expect(sharedEmberRequests[1]).toMatchObject({
      method: 'orchestrator.writeAgentServiceIdentity.v1',
    });
  });

  it('fails closed before boot succeeds when the configured OWS wallet does not resolve an EVM address', async () => {
    const sharedEmberRequests: Array<Record<string, unknown>> = [];
    const emptyVault = createEmptyOwsVaultFixture('missing-ember-lending-wallet');
    cleanupFns.push(async () => {
      emptyVault.cleanup();
    });

    const sharedEmber = await startJsonStubServer(async ({ path, body }) => {
      if (path === '/jsonrpc' && typeof body === 'object' && body !== null) {
        sharedEmberRequests.push(body as Record<string, unknown>);
      }

      return {
        body: {
          jsonrpc: '2.0',
          id: 'unexpected',
          result: {},
        },
      };
    });
    cleanupFns.push(sharedEmber.close);

    await expect(
      createEmberLendingGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: sharedEmber.baseUrl,
          ...emptyVault.env,
        },
        __internalPostgres: createInternalPostgresHooks(),
      } as never),
    ).rejects.toThrow(
      'Lending startup identity preflight failed because the configured OWS wallet did not resolve an EVM address.',
    );

    expect(sharedEmberRequests).toHaveLength(0);
  });
});
