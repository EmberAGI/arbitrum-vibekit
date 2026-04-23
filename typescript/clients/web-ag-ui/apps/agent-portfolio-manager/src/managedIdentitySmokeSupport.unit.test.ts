import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureManagedRuntimeOwnedServiceIdentities } from './managedOnboardingIdentitySmokeSupport.js';

const { createPortfolioManagerGatewayServiceMock, createEmberLendingGatewayServiceMock } =
  vi.hoisted(() => ({
    createPortfolioManagerGatewayServiceMock: vi.fn(),
    createEmberLendingGatewayServiceMock: vi.fn(),
  }));

vi.mock('./agUiServer.js', () => ({
  createPortfolioManagerGatewayService: createPortfolioManagerGatewayServiceMock,
}));

vi.mock('../../agent-ember-lending/src/agUiServer.js', () => ({
  createEmberLendingGatewayService: createEmberLendingGatewayServiceMock,
}));

type StubRequest = {
  method: string;
  path: string;
  body: unknown;
};

type StubResponse = {
  status?: number;
  body?: unknown;
};

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

describe('managed onboarding identity smoke support', () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    createPortfolioManagerGatewayServiceMock.mockReset();
    createEmberLendingGatewayServiceMock.mockReset();

    await cleanup?.();
    cleanup = null;
  });

  it('boots both managed gateways through runtime-owned startup before verifying the durable identities', async () => {
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

      if (request['method'] === 'orchestrator.readAgentServiceIdentity.v1') {
        const params =
          typeof request['params'] === 'object' && request['params'] !== null
            ? (request['params'] as Record<string, unknown>)
            : {};
        const agentId = params['agent_id'];

        return {
          body: {
            jsonrpc: '2.0',
            id: request['id'] ?? 'rpc-agent-service-identity-read',
            result: {
              protocol_version: 'v1',
              revision: agentId === 'portfolio-manager' ? 3 : 5,
              agent_service_identity: {
                identity_ref:
                  agentId === 'portfolio-manager'
                    ? 'agent-service-identity-portfolio-manager-orchestrator-1'
                    : 'agent-service-identity-ember-lending-subagent-1',
                agent_id: agentId,
                role: agentId === 'portfolio-manager' ? 'orchestrator' : 'subagent',
                wallet_address:
                  agentId === 'portfolio-manager'
                    ? '0x00000000000000000000000000000000000000c1'
                    : '0x00000000000000000000000000000000000000b1',
                wallet_source: 'ember_local_write',
                capability_metadata: {
                  onboarding: true,
                  execution: true,
                },
                registration_version: 1,
                registered_at: '2026-04-02T00:00:00.000Z',
              },
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
    cleanup = sharedEmber.close;

    const portfolioService = {
      control: {
        inspectHealth: vi.fn(async () => ({
          status: 'ok',
        })),
      },
      stop: vi.fn(async () => undefined),
    };
    const lendingService = {
      control: {
        inspectHealth: vi.fn(async () => ({
          status: 'ok',
        })),
      },
      stop: vi.fn(async () => undefined),
    };

    createPortfolioManagerGatewayServiceMock.mockResolvedValue(portfolioService);
    createEmberLendingGatewayServiceMock.mockResolvedValue(lendingService);

    await expect(
      ensureManagedRuntimeOwnedServiceIdentities({
        sharedEmberBaseUrl: sharedEmber.baseUrl,
        controllerWalletAddress: '0x00000000000000000000000000000000000000c1',
        subagentWalletAddress: '0x00000000000000000000000000000000000000b1',
        controllerEnv: {
          PORTFOLIO_MANAGER_OWS_WALLET_NAME: 'portfolio-manager-controller-wallet',
          PORTFOLIO_MANAGER_OWS_VAULT_PATH: '/tmp/portfolio-manager-ows-vault',
        },
        lendingEnv: {
          EMBER_LENDING_OWS_WALLET_NAME: 'ember-lending-service-wallet',
          EMBER_LENDING_OWS_VAULT_PATH: '/tmp/ember-lending-ows-vault',
        },
      }),
    ).resolves.toEqual({
      orchestratorWallet: '0x00000000000000000000000000000000000000c1',
      subagentWallet: '0x00000000000000000000000000000000000000b1',
    });

    expect(createPortfolioManagerGatewayServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: sharedEmber.baseUrl,
          PORTFOLIO_MANAGER_OWS_WALLET_NAME: 'portfolio-manager-controller-wallet',
          PORTFOLIO_MANAGER_OWS_VAULT_PATH: '/tmp/portfolio-manager-ows-vault',
        }),
        __internalPostgres: expect.objectContaining({
          ensureReady: expect.any(Function),
          loadInspectionState: expect.any(Function),
          executeStatements: expect.any(Function),
          persistDirectExecution: expect.any(Function),
        }),
      }),
    );
    expect(createEmberLendingGatewayServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: sharedEmber.baseUrl,
          EMBER_LENDING_OWS_WALLET_NAME: 'ember-lending-service-wallet',
          EMBER_LENDING_OWS_VAULT_PATH: '/tmp/ember-lending-ows-vault',
        }),
        __internalPostgres: expect.objectContaining({
          ensureReady: expect.any(Function),
          loadInspectionState: expect.any(Function),
          executeStatements: expect.any(Function),
          persistDirectExecution: expect.any(Function),
        }),
      }),
    );
    expect(portfolioService.control.inspectHealth).toHaveBeenCalledOnce();
    expect(lendingService.control.inspectHealth).toHaveBeenCalledOnce();
    expect(portfolioService.stop).toHaveBeenCalledOnce();
    expect(lendingService.stop).toHaveBeenCalledOnce();
  });
});
