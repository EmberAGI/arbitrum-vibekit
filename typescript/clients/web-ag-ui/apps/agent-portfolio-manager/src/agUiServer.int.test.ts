import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPortfolioManagerAgUiHandler,
  createPortfolioManagerGatewayService,
  PORTFOLIO_MANAGER_AGENT_ID,
} from './agUiServer.js';
import { createPortfolioManagerDomain } from './sharedEmberAdapter.js';

type AgUiEventEnvelope = {
  type: string;
  [key: string]: unknown;
};

async function readRequestBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function writeNodeResponse(response: Response, target: ServerResponse): Promise<void> {
  target.statusCode = response.status;

  response.headers.forEach((value, key) => {
    target.setHeader(key, value);
  });

  const body = new Uint8Array(await response.arrayBuffer());
  target.end(body);
}

function parseEventStreamBody(body: string): AgUiEventEnvelope[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)) as AgUiEventEnvelope);
}

function findStateSnapshot(events: readonly AgUiEventEnvelope[]) {
  return [...events].reverse().find((event) => event.type === 'STATE_SNAPSHOT');
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

function createPortfolioManagerSetupInput() {
  return {
    walletAddress: '0x00000000000000000000000000000000000000a1' as const,
    portfolioMandate: {
      approved: true,
      riskLevel: 'medium' as const,
    },
    managedAgentMandates: [
      {
        agentKey: 'ember-lending-primary',
        agentType: 'ember-lending',
        approved: true,
        settings: {
          network: 'arbitrum',
          protocol: 'aave',
          allowedCollateralAssets: ['USDC'],
          allowedBorrowAssets: ['USDC'],
          maxAllocationPct: 35,
          maxLtvBps: 7000,
          minHealthFactor: '1.25',
        },
      },
    ],
  };
}

describe('agent-portfolio-manager AG-UI integration', () => {
  let server: Server;
  let baseUrl: string;
  const protocolHost = {
    handleJsonRpc: vi.fn(async (input: unknown) => {
      const request =
        typeof input === 'object' && input !== null
          ? (input as { method?: unknown })
          : {};

      switch (request.method) {
        case 'subagent.readPortfolioState.v1':
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-current-revision',
            result: {
              protocol_version: 'v1',
              revision: 0,
              portfolio_state: {
                agent_id: 'portfolio-manager',
                owned_units: [],
                reservations: [],
              },
            },
          };
        case 'orchestrator.completeRootedBootstrapFromUserSigning.v1':
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-complete-rooted-bootstrap',
            result: {
              protocol_version: 'v1',
              revision: 3,
              committed_event_ids: ['evt-rooted-bootstrap-1', 'evt-rooted-bootstrap-2'],
              rooted_wallet_context_id: 'rwc-thread10x00000000000000000000000000000000000000a1',
              root_delegation: {
                root_delegation_id: 'root-thread10x00000000000000000000000000000000000000a1',
                user_wallet: '0x00000000000000000000000000000000000000a1',
                status: 'active',
              },
            },
          };
        default:
          throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }
    }),
    readCommittedEventOutbox: vi.fn(async () => ({
      protocol_version: 'v1',
      revision: 3,
      events: [],
    })),
    acknowledgeCommittedEventOutbox: vi.fn(async () => ({
      protocol_version: 'v1',
      revision: 3,
      consumer_id: 'portfolio-manager',
      acknowledged_through_sequence: 0,
    })),
  };

  beforeEach(async () => {
    const service = await createPortfolioManagerGatewayService({
      runtimeConfig: {
        model: {
          id: 'openai/gpt-5.4-mini',
          name: 'openai/gpt-5.4-mini',
          api: 'openai-responses',
          provider: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          reasoning: true,
        },
        systemPrompt: 'Portfolio manager test runtime.',
        tools: [],
        domain: createPortfolioManagerDomain({
          protocolHost,
          agentId: 'portfolio-manager',
        }),
        agentOptions: {
          initialState: {
            thinkingLevel: 'low',
          },
          getApiKey: () => 'test-openrouter-key',
        },
      },
      __internalPostgres: createInternalPostgresHooks(),
    } as any);

    const handler = createPortfolioManagerAgUiHandler({
      agentId: PORTFOLIO_MANAGER_AGENT_ID,
      service,
    });

    server = createServer((request, response) => {
      void (async () => {
        const body = await readRequestBody(request);
        const origin = `http://${request.headers.host ?? '127.0.0.1'}`;
        const url = new URL(request.url ?? '/', origin);

        const headers = Object.entries(request.headers).flatMap(
          ([name, value]): Array<[string, string]> => {
            if (Array.isArray(value)) {
              return value.map((entry) => [name, entry]);
            }

            return value ? [[name, value]] : [];
          },
        );

        const webRequest = new Request(url, {
          method: request.method,
          headers: new Headers(headers),
          body: body.length > 0 ? body : undefined,
          duplex: 'half',
        });
        const webResponse = await handler(webRequest);
        await writeNodeResponse(webResponse, response);
      })().catch((error: unknown) => {
        response.statusCode = 500;
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
    baseUrl = `http://127.0.0.1:${address.port}/ag-ui`;
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
    protocolHost.handleJsonRpc.mockClear();
    protocolHost.readCommittedEventOutbox.mockClear();
    protocolHost.acknowledgeCommittedEventOutbox.mockClear();
  });

  it('serves portfolio-manager hire and onboarding over real AG-UI HTTP endpoints', async () => {
    const hireResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-1',
        runId: 'run-hire',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    });

    expect(hireResponse.ok).toBe(true);
    expect(hireResponse.headers.get('content-type')).toContain('text/event-stream');
    const hireEvents = parseEventStreamBody(await hireResponse.text());
    const hireSnapshot = findStateSnapshot(hireEvents);

    expect(hireSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'onboarding',
            activeWalletAddress: null,
            pendingOnboardingWalletAddress: null,
          },
          task: {
            taskStatus: {
              state: 'input-required',
              message: {
                content: 'Connect the wallet you want the portfolio manager to onboard.',
              },
            },
          },
          artifacts: {
            current: {
              data: {
                type: 'interrupt-status',
                interruptType: 'portfolio-manager-setup-request',
              },
            },
          },
        },
      },
    });

    const setupResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-1',
        runId: 'run-setup',
        forwardedProps: {
          command: {
            resume: JSON.stringify(createPortfolioManagerSetupInput()),
          },
        },
      }),
    });

    expect(setupResponse.ok).toBe(true);
    const setupEvents = parseEventStreamBody(await setupResponse.text());
    const setupSnapshot = findStateSnapshot(setupEvents);

    expect(setupSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'onboarding',
            activeWalletAddress: '0x00000000000000000000000000000000000000a1',
            pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          },
          task: {
            taskStatus: {
              state: 'input-required',
              message: {
                content: 'Review and sign the delegation needed to activate your portfolio manager.',
              },
            },
          },
          artifacts: {
            current: {
              data: {
                type: 'interrupt-status',
                interruptType: 'portfolio-manager-delegation-signing-request',
                payload: {
                  chainId: 42161,
                  delegatorAddress: '0x00000000000000000000000000000000000000a1',
                },
              },
            },
          },
        },
      },
    });
    expect(setupSnapshot).toMatchObject({
      snapshot: {
        thread: {
          activity: {
            events: expect.arrayContaining([
              expect.objectContaining({
                type: 'dispatch-response',
                parts: expect.arrayContaining([
                  expect.objectContaining({
                    kind: 'a2ui',
                    data: expect.objectContaining({
                      payload: expect.objectContaining({
                        kind: 'interrupt',
                        payload: expect.objectContaining({
                          type: 'portfolio-manager-delegation-signing-request',
                          delegationManager: '0x1111111111111111111111111111111111111111',
                          delegateeAddress: '0x2222222222222222222222222222222222222222',
                        }),
                      }),
                    }),
                  }),
                ]),
              }),
            ]),
          },
        },
      },
    });

    const signingResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-1',
        runId: 'run-signing',
        forwardedProps: {
          command: {
            resume: JSON.stringify({
              outcome: 'signed',
              signedDelegations: [
                {
                  delegate: '0x2222222222222222222222222222222222222222',
                  delegator: '0x00000000000000000000000000000000000000a1',
                  authority: '0x0000000000000000000000000000000000000000000000000000000000000000',
                  caveats: [],
                  salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
                  signature: '0x1234',
                },
              ],
            }),
          },
        },
      }),
    });

    expect(signingResponse.ok).toBe(true);
    const signingEvents = parseEventStreamBody(await signingResponse.text());
    const signingSnapshot = findStateSnapshot(signingEvents);

    expect(signingSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'active',
            lastRootedWalletContextId: 'rwc-thread10x00000000000000000000000000000000000000a1',
            activeWalletAddress: '0x00000000000000000000000000000000000000a1',
            pendingOnboardingWalletAddress: null,
          },
          task: {
            taskStatus: {
              state: 'working',
              message: {
                content: 'Portfolio manager onboarding complete. Agent is active.',
              },
            },
          },
          artifacts: {
            current: {
              data: {
                type: 'shared-ember-rooted-bootstrap',
                rootedWalletContextId: 'rwc-thread10x00000000000000000000000000000000000000a1',
                rootDelegation: {
                  user_wallet: '0x00000000000000000000000000000000000000a1',
                  status: 'active',
                },
              },
            },
          },
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
        params: expect.objectContaining({
          expected_revision: 0,
          onboarding: expect.objectContaining({
            rootedWalletContext: expect.objectContaining({
              wallet_address: '0x00000000000000000000000000000000000000a1',
              metadata: expect.objectContaining({
                approvedMandateEnvelope: expect.objectContaining({
                  portfolioMandate: {
                    approved: true,
                    riskLevel: 'medium',
                  },
                }),
              }),
            }),
            mandates: expect.arrayContaining([
              expect.objectContaining({
                agent_id: 'portfolio-manager',
              }),
              expect.objectContaining({
                agent_id: 'ember-lending',
              }),
            ]),
            reservations: expect.arrayContaining([
              expect.objectContaining({
                agent_id: 'ember-lending',
                control_path: 'lending.supply',
              }),
            ]),
          }),
          handoff: expect.objectContaining({
            user_wallet: '0x00000000000000000000000000000000000000a1',
            orchestrator_wallet: '0x2222222222222222222222222222222222222222',
          }),
        }),
      }),
    );
  });

  it('clears wallet-local onboarding state when delegation signing is rejected', async () => {
    const hireResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-cancel',
        runId: 'run-hire',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    });
    expect(hireResponse.ok).toBe(true);

    const setupResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-cancel',
        runId: 'run-setup',
        forwardedProps: {
          command: {
            resume: JSON.stringify(createPortfolioManagerSetupInput()),
          },
        },
      }),
    });
    expect(setupResponse.ok).toBe(true);

    const signingResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-cancel',
        runId: 'run-signing-rejected',
        forwardedProps: {
          command: {
            resume: JSON.stringify({
              outcome: 'rejected',
            }),
          },
        },
      }),
    });

    expect(signingResponse.ok).toBe(true);
    const signingEvents = parseEventStreamBody(await signingResponse.text());
    const signingSnapshot = findStateSnapshot(signingEvents);

    expect(signingSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'prehire',
            activeWalletAddress: null,
            pendingOnboardingWalletAddress: null,
          },
          task: {
            taskStatus: {
              state: 'canceled',
              message: {
                content:
                  'Portfolio manager onboarding was canceled because delegation signing was rejected.',
              },
            },
          },
        },
      },
    });
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
      }),
    );
  });

  it('marks the agent completed only after fire and then allows rehire', async () => {
    const hireResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-rehire',
        runId: 'run-hire',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    });
    expect(hireResponse.ok).toBe(true);

    const setupResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-rehire',
        runId: 'run-setup',
        forwardedProps: {
          command: {
            resume: JSON.stringify(createPortfolioManagerSetupInput()),
          },
        },
      }),
    });
    expect(setupResponse.ok).toBe(true);

    const signingResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-rehire',
        runId: 'run-signing',
        forwardedProps: {
          command: {
            resume: JSON.stringify({
              outcome: 'signed',
              signedDelegations: [
                {
                  delegate: '0x2222222222222222222222222222222222222222',
                  delegator: '0x00000000000000000000000000000000000000a1',
                  authority: '0x0000000000000000000000000000000000000000000000000000000000000000',
                  caveats: [],
                  salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
                  signature: '0x1234',
                },
              ],
            }),
          },
        },
      }),
    });
    expect(signingResponse.ok).toBe(true);

    const fireResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-rehire',
        runId: 'run-fire',
        forwardedProps: {
          command: {
            name: 'fire',
          },
        },
      }),
    });

    expect(fireResponse.ok).toBe(true);
    const fireEvents = parseEventStreamBody(await fireResponse.text());
    const fireSnapshot = findStateSnapshot(fireEvents);

    expect(fireSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'prehire',
            lastRootedWalletContextId: null,
            activeWalletAddress: null,
            pendingOnboardingWalletAddress: null,
          },
          task: {
            taskStatus: {
              state: 'completed',
              message: {
                content: 'Portfolio manager fired. Ready to hire again.',
              },
            },
          },
        },
      },
    });

    const rehireResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-rehire',
        runId: 'run-rehire',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    });

    expect(rehireResponse.ok).toBe(true);
    const rehireEvents = parseEventStreamBody(await rehireResponse.text());
    const rehireSnapshot = findStateSnapshot(rehireEvents);

    expect(rehireSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'onboarding',
          },
          task: {
            taskStatus: {
              state: 'input-required',
              message: {
                content: 'Connect the wallet you want the portfolio manager to onboard.',
              },
            },
          },
        },
      },
    });
  });
});
