import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPortfolioManagerAgUiHandler,
  createPortfolioManagerGatewayService,
  PORTFOLIO_MANAGER_AGENT_ID,
} from './agUiServer.js';
import { createPortfolioManagerDomain } from './sharedEmberAdapter.js';

const TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS =
  '0x3b32650cefcb53bf0365058c5576d70226225fc4' as const;
const TEST_DELEGATION_MANAGER = '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as const;

type AgUiEventEnvelope = {
  type: string;
  [key: string]: unknown;
};

type JsonPatchOperation = {
  op: string;
  path: string;
  value?: unknown;
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

  const reader = response.body?.getReader();
  if (!reader) {
    target.end();
    return;
  }

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }

      target.write(Buffer.from(result.value));
    }
  } finally {
    target.end();
    await reader.cancel().catch(() => undefined);
  }
}

function parseEventStreamBody(body: string): AgUiEventEnvelope[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)) as AgUiEventEnvelope);
}

function findStateDeltas(events: readonly AgUiEventEnvelope[]) {
  return events.filter(
    (event): event is AgUiEventEnvelope & { delta: JsonPatchOperation[] } =>
      event.type === 'STATE_DELTA' && Array.isArray(event['delta']),
  );
}

function expectStateDeltaOperation(
  events: readonly AgUiEventEnvelope[],
  predicate: (operation: JsonPatchOperation) => boolean,
) {
  const stateDeltas = findStateDeltas(events);
  expect(stateDeltas).not.toHaveLength(0);
  expect(stateDeltas.some((event) => event.delta.some(predicate))).toBe(true);
}

async function readFirstMatchingSseEvent(
  response: Response,
  predicate: (event: AgUiEventEnvelope) => boolean,
): Promise<AgUiEventEnvelope | undefined> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Expected an SSE response body.');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  const parseChunk = (chunk: string): AgUiEventEnvelope[] =>
    chunk
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice('data: '.length)) as AgUiEventEnvelope);

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const matchingEvent = parseChunk(frame).find(predicate);
        if (matchingEvent) {
          return matchingEvent;
        }
      }
    }

    buffer += decoder.decode();
    return parseChunk(buffer).find(predicate);
  } finally {
    await reader.cancel();
  }
}

async function readThreadSnapshot(params: {
  baseUrl: string;
  agentId: string;
  threadId: string;
}) {
  const connectResponse = await fetch(`${params.baseUrl}/agent/${params.agentId}/connect`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      threadId: params.threadId,
    }),
  });

  expect(connectResponse.ok).toBe(true);
  const connectSnapshot = await readFirstMatchingSseEvent(
    connectResponse,
    (event) => event.type === 'STATE_SNAPSHOT',
  );
  expect(connectSnapshot).toBeDefined();
  return connectSnapshot;
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
    firstManagedMandate: {
      targetAgentId: 'ember-lending',
      targetAgentKey: 'ember-lending-primary',
      managedMandate: {
        lending_policy: {
          collateral_policy: {
            assets: [
              {
                asset: 'USDC',
                max_allocation_pct: 35,
              },
            ],
          },
          borrow_policy: {
            allowed_assets: ['USDC'],
          },
          risk_policy: {
            max_ltv_bps: 7000,
            min_health_factor: '1.25',
          },
        },
      },
    },
  };
}

function createAgentServiceIdentityResponse(input: {
  agentId: string;
  role: 'orchestrator' | 'subagent';
  walletAddress: `0x${string}`;
  revision?: number;
}) {
  return {
    jsonrpc: '2.0',
    id: 'rpc-agent-service-identity-read',
    result: {
      protocol_version: 'v1',
      revision: input.revision ?? 0,
      agent_service_identity: {
        identity_ref: `agent-service-identity-${input.agentId}-${input.role}-1`,
        agent_id: input.agentId,
        role: input.role,
        wallet_address: input.walletAddress,
        wallet_source: 'ember_local_write',
        capability_metadata:
          input.role === 'orchestrator'
            ? {
                onboarding: true,
                root_registration: true,
              }
            : {
                execution: true,
                onboarding: true,
              },
        registration_version: 1,
        registered_at: '2026-04-02T09:00:00.000Z',
      },
    },
  };
}

async function handleDefaultSharedEmberJsonRpc(input: unknown): Promise<unknown> {
  const request =
    typeof input === 'object' && input !== null
      ? (input as { method?: unknown; params?: Record<string, unknown> })
      : {};

  switch (request.method) {
    case 'orchestrator.readAgentServiceIdentity.v1':
      if (
        request.params?.['agent_id'] === 'portfolio-manager' &&
        request.params['role'] === 'orchestrator'
      ) {
        return createAgentServiceIdentityResponse({
          agentId: 'portfolio-manager',
          role: 'orchestrator',
          walletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
        });
      }

      if (
        request.params?.['agent_id'] === 'ember-lending' &&
        request.params['role'] === 'subagent'
      ) {
        return createAgentServiceIdentityResponse({
          agentId: 'ember-lending',
          role: 'subagent',
          walletAddress: '0x00000000000000000000000000000000000000b1',
        });
      }

      throw new Error(
        `Unexpected Shared Ember identity lookup: ${JSON.stringify(request.params ?? {})}`,
      );
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
    case 'subagent.readExecutionContext.v1':
      return {
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-read-execution-context',
        result: {
          protocol_version: 'v1',
          revision: 4,
          execution_context: {
            subagent_wallet_address: '0x00000000000000000000000000000000000000b1',
          },
        },
      };
    case 'orchestrator.readOnboardingState.v1':
      return {
        jsonrpc: '2.0',
        id: 'shared-ember-wallet-accounting-ember-lending-0x00000000000000000000000000000000000000a1',
        result: {
          revision: 4,
          onboarding_state: {
            wallet_address: '0x00000000000000000000000000000000000000a1',
            network: 'arbitrum',
            phase: 'active',
            proofs: {
              rooted_wallet_context_registered: true,
              root_delegation_registered: true,
              root_authority_active: true,
              wallet_baseline_observed: true,
              accounting_units_seeded: true,
              mandate_inputs_configured: true,
              reserve_policy_configured: false,
              capital_reserved_for_agent: true,
              policy_snapshot_recorded: true,
              initial_subagent_delegation_issued: true,
              agent_active: true,
            },
            rooted_wallet_context: {
              rooted_wallet_context_id: 'rwc-thread10x00000000000000000000000000000000000000a1',
            },
            root_delegation: {
              root_delegation_id: 'root-thread10x00000000000000000000000000000000000000a1',
            },
            owned_units: [
              {
                unit_id: 'unit-thread1-usdc-001',
                root_asset: 'USDC',
                quantity: '10',
                status: 'reserved',
                control_path: 'lending.supply',
                reservation_id: 'reservation-thread1-usdc-001',
              },
            ],
            reservations: [
              {
                reservation_id: 'reservation-thread1-usdc-001',
                agent_id: 'ember-lending',
                purpose: 'position.enter',
                status: 'active',
                control_path: 'lending.supply',
                unit_allocations: [
                  {
                    unit_id: 'unit-thread1-usdc-001',
                    quantity: '10',
                  },
                ],
              },
            ],
          },
        },
      };
    default:
      throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
  }
}

describe('agent-portfolio-manager AG-UI integration', () => {
  let server: Server;
  let baseUrl: string;
  const protocolHost = {
    handleJsonRpc: vi.fn(handleDefaultSharedEmberJsonRpc),
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
    protocolHost.handleJsonRpc.mockImplementation(handleDefaultSharedEmberJsonRpc);
    const service = await createPortfolioManagerGatewayService({
      runtimeConfig: {
        model: {
          id: 'openai/gpt-5.4',
          name: 'openai/gpt-5.4',
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
          controllerWalletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
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
    protocolHost.handleJsonRpc.mockReset();
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
    expect(parseEventStreamBody(await hireResponse.text())).not.toHaveLength(0);
    const hireSnapshot = await readThreadSnapshot({
      baseUrl,
      agentId: PORTFOLIO_MANAGER_AGENT_ID,
      threadId: 'thread-1',
    });

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
    expect(parseEventStreamBody(await setupResponse.text())).not.toHaveLength(0);
    const setupSnapshot = await readThreadSnapshot({
      baseUrl,
      agentId: PORTFOLIO_MANAGER_AGENT_ID,
      threadId: 'thread-1',
    });

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
                          delegationManager: TEST_DELEGATION_MANAGER,
                          delegateeAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
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
                  delegate: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
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
    expectStateDeltaOperation(
      signingEvents,
      (operation) =>
        operation.op === 'replace' &&
        operation.path === '/thread/lifecycle/phase' &&
        operation.value === 'active',
    );
    expectStateDeltaOperation(
      signingEvents,
      (operation) =>
        operation.op === 'replace' &&
        operation.path === '/thread/task/taskStatus/state' &&
        operation.value === 'completed',
    );
    expectStateDeltaOperation(
      signingEvents,
      (operation) =>
        operation.op === 'replace' &&
        operation.path === '/thread/task/taskStatus/message/content' &&
        operation.value === 'Portfolio manager onboarding complete. Agent is active.',
    );

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
        params: expect.objectContaining({
          expected_revision: 0,
          onboarding: expect.objectContaining({
            rootedWalletContext: expect.objectContaining({
              wallet_address: '0x00000000000000000000000000000000000000a1',
              metadata: expect.objectContaining({
                approvedOnboardingSetup: expect.objectContaining({
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
                managed_mandate: null,
              }),
              expect.objectContaining({
                agent_id: 'ember-lending',
                managed_mandate: {
                  lending_policy: {
                    collateral_policy: {
                      assets: [
                        {
                          asset: 'USDC',
                          max_allocation_pct: 35,
                        },
                      ],
                    },
                    borrow_policy: {
                      allowed_assets: ['USDC'],
                    },
                    risk_policy: {
                      max_ltv_bps: 7000,
                      min_health_factor: '1.25',
                    },
                  },
                },
	              }),
	            ]),
            activation: {
              mandateRef: expect.stringContaining('mandate-'),
            },
          }),
          handoff: expect.objectContaining({
            user_wallet: '0x00000000000000000000000000000000000000a1',
            orchestrator_wallet: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
          }),
        }),
      }),
    );
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.readExecutionContext.v1',
        params: {
          agent_id: 'ember-lending',
          rooted_wallet_context_id: 'rwc-thread10x00000000000000000000000000000000000000a1',
        },
      }),
    );

    const rootedBootstrapRequest = protocolHost.handleJsonRpc.mock.calls.find(
      ([request]) =>
        typeof request === 'object' &&
        request !== null &&
        'method' in request &&
        request.method === 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
    )?.[0] as {
      params?: {
        onboarding?: {
          mandates?: Array<{
            mandate_ref?: string;
            agent_id?: string;
          }>;
          activation?: {
            mandateRef?: string;
          };
        } & Record<string, unknown>;
      };
    };

    const managedMandateRef = rootedBootstrapRequest.params?.onboarding?.mandates?.find(
      (mandate) => mandate.agent_id === 'ember-lending',
    )?.mandate_ref;
    expect(managedMandateRef).toEqual(expect.any(String));
    expect(rootedBootstrapRequest.params?.onboarding?.activation?.mandateRef).toBe(managedMandateRef);

    expect(rootedBootstrapRequest.params?.onboarding).not.toHaveProperty('capitalObservation');
    expect(rootedBootstrapRequest.params?.onboarding).not.toHaveProperty('ownedUnits');
    expect(rootedBootstrapRequest.params?.onboarding).not.toHaveProperty('reservations');
    expect(rootedBootstrapRequest.params?.onboarding).not.toHaveProperty('policySnapshots');
  });

  it('blocks onboarding over AG-UI when the managed ember-lending identity is missing', async () => {
    protocolHost.handleJsonRpc.mockImplementation(async (input: unknown): Promise<unknown> => {
      const request =
        typeof input === 'object' && input !== null
          ? (input as { method?: unknown; params?: Record<string, unknown> })
          : {};

      if (request.method === 'orchestrator.readAgentServiceIdentity.v1') {
        if (
          request.params?.['agent_id'] === 'portfolio-manager' &&
          request.params['role'] === 'orchestrator'
        ) {
          return createAgentServiceIdentityResponse({
            agentId: 'portfolio-manager',
            role: 'orchestrator',
            walletAddress: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
          });
        }

        if (
          request.params?.['agent_id'] === 'ember-lending' &&
          request.params['role'] === 'subagent'
        ) {
          return {
            jsonrpc: '2.0',
            id: 'rpc-agent-service-identity-read',
            result: {
              protocol_version: 'v1',
              revision: 0,
              agent_service_identity: null,
            },
          };
        }
      }

      return handleDefaultSharedEmberJsonRpc(input);
    });

    const hireResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-blocked',
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
        threadId: 'thread-blocked',
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
        threadId: 'thread-blocked',
        runId: 'run-signing',
        forwardedProps: {
          command: {
            resume: JSON.stringify({
              outcome: 'signed',
              signedDelegations: [
                {
                  delegate: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
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
    expectStateDeltaOperation(
      signingEvents,
      (operation) =>
        operation.op === 'replace' &&
        operation.path === '/thread/task/taskStatus/state' &&
        operation.value === 'failed',
    );
    expectStateDeltaOperation(
      signingEvents,
      (operation) =>
        operation.op === 'replace' &&
        operation.path === '/thread/task/taskStatus/message/content' &&
        operation.value ===
          'Portfolio manager onboarding is blocked until the ember-lending service registers its subagent identity in Shared Ember.',
    );

    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
      }),
    );
  });

  it('blocks onboarding over AG-UI when the portfolio-manager orchestrator identity is missing', async () => {
    protocolHost.handleJsonRpc.mockImplementation(async (input: unknown): Promise<unknown> => {
      const request =
        typeof input === 'object' && input !== null
          ? (input as { method?: unknown; params?: Record<string, unknown> })
          : {};

      if (request.method === 'orchestrator.readAgentServiceIdentity.v1') {
        if (
          request.params?.['agent_id'] === 'portfolio-manager' &&
          request.params['role'] === 'orchestrator'
        ) {
          return {
            jsonrpc: '2.0',
            id: 'rpc-agent-service-identity-read',
            result: {
              protocol_version: 'v1',
              revision: 0,
              agent_service_identity: null,
            },
          };
        }
      }

      return handleDefaultSharedEmberJsonRpc(input);
    });

    const hireResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-blocked-orchestrator',
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
        threadId: 'thread-blocked-orchestrator',
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
        threadId: 'thread-blocked-orchestrator',
        runId: 'run-signing',
        forwardedProps: {
          command: {
            resume: JSON.stringify({
              outcome: 'signed',
              signedDelegations: [
                {
                  delegate: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
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
    expectStateDeltaOperation(
      signingEvents,
      (operation) =>
        operation.op === 'replace' &&
        operation.path === '/thread/task/taskStatus/state' &&
        operation.value === 'failed',
    );
    expectStateDeltaOperation(
      signingEvents,
      (operation) =>
        operation.op === 'replace' &&
        operation.path === '/thread/task/taskStatus/message/content' &&
        operation.value ===
          'Portfolio manager onboarding is blocked until the portfolio-manager service registers its orchestrator identity in Shared Ember.',
    );

    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
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
    expectStateDeltaOperation(
      signingEvents,
      (operation) =>
        operation.op === 'replace' &&
        operation.path === '/thread/lifecycle/phase' &&
        operation.value === 'prehire',
    );
    expectStateDeltaOperation(
      signingEvents,
      (operation) =>
        operation.op === 'replace' &&
        operation.path === '/thread/task/taskStatus/state' &&
        operation.value === 'canceled',
    );
    expectStateDeltaOperation(
      signingEvents,
      (operation) =>
        operation.op === 'replace' &&
        operation.path === '/thread/task/taskStatus/message/content' &&
        operation.value ===
          'Portfolio manager onboarding was canceled because delegation signing was rejected.',
    );
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
                  delegate: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
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
    expect(parseEventStreamBody(await fireResponse.text())).not.toHaveLength(0);
    const fireSnapshot = await readThreadSnapshot({
      baseUrl,
      agentId: PORTFOLIO_MANAGER_AGENT_ID,
      threadId: 'thread-rehire',
    });

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
    expect(
      (fireSnapshot as {
        snapshot?: {
          thread?: {
            artifacts?: {
              current?: unknown;
            };
          };
        };
      }).snapshot?.thread?.artifacts?.current,
    ).toBeUndefined();

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
    expect(parseEventStreamBody(await rehireResponse.text())).not.toHaveLength(0);
    const rehireSnapshot = await readThreadSnapshot({
      baseUrl,
      agentId: PORTFOLIO_MANAGER_AGENT_ID,
      threadId: 'thread-rehire',
    });

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
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.readExecutionContext.v1',
        params: {
          agent_id: 'ember-lending',
          rooted_wallet_context_id: 'rwc-thread10x00000000000000000000000000000000000000a1',
        },
      }),
    );
  });

  it('allows a fresh setup and signer completion after fire on the same thread', async () => {
    const firstSetup = createPortfolioManagerSetupInput();
    const secondSetup = {
      ...createPortfolioManagerSetupInput(),
      firstManagedMandate: {
        ...createPortfolioManagerSetupInput().firstManagedMandate,
        managedMandate: {
          lending_policy: {
            collateral_policy: {
              assets: [
                {
                  asset: 'USDC',
                  max_allocation_pct: 35,
                },
              ],
            },
            borrow_policy: {
              allowed_assets: ['WETH'],
            },
            risk_policy: {
              max_ltv_bps: 7000,
              min_health_factor: '1.25',
            },
          },
        },
      },
    };
    const signedDelegation = {
      delegate: TEST_CONTROLLER_SMART_ACCOUNT_ADDRESS,
      delegator: '0x00000000000000000000000000000000000000a1',
      authority: '0x0000000000000000000000000000000000000000000000000000000000000000',
      caveats: [],
      salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
      signature: '0x1234',
    };

    const hireResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-rehire-signing',
        runId: 'run-hire-1',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    });
    expect(hireResponse.ok).toBe(true);

    const firstSetupResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-rehire-signing',
        runId: 'run-setup-1',
        forwardedProps: {
          command: {
            resume: JSON.stringify(firstSetup),
          },
        },
      }),
    });
    expect(firstSetupResponse.ok).toBe(true);

    const firstSigningResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-rehire-signing',
        runId: 'run-signing-1',
        forwardedProps: {
          command: {
            resume: JSON.stringify({
              outcome: 'signed',
              signedDelegations: [signedDelegation],
            }),
          },
        },
      }),
    });
    expect(firstSigningResponse.ok).toBe(true);

    const fireResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-rehire-signing',
        runId: 'run-fire',
        forwardedProps: {
          command: {
            name: 'fire',
          },
        },
      }),
    });
    expect(fireResponse.ok).toBe(true);

    const rehireResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-rehire-signing',
        runId: 'run-hire-2',
        forwardedProps: {
          command: {
            name: 'hire',
          },
        },
      }),
    });
    expect(rehireResponse.ok).toBe(true);

    const secondSetupResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-rehire-signing',
        runId: 'run-setup-2',
        forwardedProps: {
          command: {
            resume: JSON.stringify(secondSetup),
          },
        },
      }),
    });
    expect(secondSetupResponse.ok).toBe(true);

    const secondSigningResponse = await fetch(`${baseUrl}/agent/${PORTFOLIO_MANAGER_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-rehire-signing',
        runId: 'run-signing-2',
        forwardedProps: {
          command: {
            resume: JSON.stringify({
              outcome: 'signed',
              signedDelegations: [signedDelegation],
            }),
          },
        },
      }),
    });

    expect(secondSigningResponse.ok).toBe(true);
    const secondSigningEvents = parseEventStreamBody(await secondSigningResponse.text());
    expectStateDeltaOperation(
      secondSigningEvents,
      (operation) =>
        operation.op === 'replace' &&
        operation.path === '/thread/task/taskStatus/state' &&
        operation.value === 'completed',
    );
    expectStateDeltaOperation(
      secondSigningEvents,
      (operation) =>
        operation.op === 'replace' &&
        operation.path === '/thread/task/taskStatus/message/content' &&
        operation.value === 'Portfolio manager onboarding complete. Agent is active.',
    );

    const finalSnapshot = await readThreadSnapshot({
      baseUrl,
      agentId: PORTFOLIO_MANAGER_AGENT_ID,
      threadId: 'thread-rehire-signing',
    });

    expect(finalSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'active',
            activeWalletAddress: '0x00000000000000000000000000000000000000a1',
            pendingOnboardingWalletAddress: null,
          },
          task: {
            taskStatus: {
              state: 'completed',
              message: {
                content: 'Portfolio manager onboarding complete. Agent is active.',
              },
            },
          },
        },
      },
    });

    const rootedBootstrapCalls = (
      protocolHost.handleJsonRpc.mock.calls as unknown as Array<[{
        method?: string;
        params?: {
          onboarding?: {
            rootedWalletContext?: {
              metadata?: {
                approvedOnboardingSetup?: unknown;
              };
            };
          };
        };
      }]>
    ).filter(([request]) => request.method === 'orchestrator.completeRootedBootstrapFromUserSigning.v1');

    expect(rootedBootstrapCalls).toHaveLength(2);
    expect(rootedBootstrapCalls.at(-1)?.[0]).toMatchObject({
      params: {
        onboarding: {
          rootedWalletContext: {
            metadata: {
              approvedOnboardingSetup: expect.objectContaining({
                portfolioMandate: secondSetup.portfolioMandate,
                firstManagedMandate: secondSetup.firstManagedMandate,
              }),
            },
          },
        },
      },
    });
  });
});
