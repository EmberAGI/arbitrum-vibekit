import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEmberLendingAgUiHandler,
  createEmberLendingGatewayService,
  EMBER_LENDING_AGENT_ID,
} from './agUiServer.js';
import { createEmberLendingDomain } from './sharedEmberAdapter.js';

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

  const reader = response.body?.getReader();
  if (!reader) {
    target.end();
    return;
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      target.end();
      return;
    }

    target.write(Buffer.from(value));
  }
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

async function readEventStreamUntilStateSnapshot(response: Response): Promise<AgUiEventEnvelope[]> {
  const reader = response.body?.getReader();
  if (!reader) {
    return [];
  }

  const decoder = new TextDecoder();
  const events: AgUiEventEnvelope[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, {
      stream: true,
    });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      for (const line of frame.split('\n')) {
        if (!line.startsWith('data: ')) {
          continue;
        }

        const event = JSON.parse(line.slice('data: '.length)) as AgUiEventEnvelope;
        events.push(event);
        if (event.type === 'STATE_SNAPSHOT') {
          await reader.cancel();
          return events;
        }
      }

      boundary = buffer.indexOf('\n\n');
    }
  }

  return events;
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

function createCandidatePlanInput() {
  return {
    idempotencyKey: 'idem-candidate-plan-001',
    intent: 'deploy',
    action_summary: 'supply reserved USDC on Aave',
    candidate_unit_ids: ['unit-ember-lending-001'],
    requested_quantities: [
      {
        unit_id: 'unit-ember-lending-001',
        quantity: '10',
      },
    ],
    decision_context: {
      objective_summary: 'deploy reserved capital into the approved lending lane',
      accounting_state_summary: 'one reserved USDC unit is available for the lending agent',
      why_this_path_is_best: 'lending.supply is the admitted path for this reservation',
      consequence_if_delayed: 'reserved capital remains idle',
      alternatives_considered: ['leave the unit idle'],
    },
    payload_builder_output: {
      transaction_payload_ref: 'tx-lending-supply-001',
      required_control_path: 'lending.supply',
      network: 'arbitrum',
    },
  };
}

function createEscalationRequestInput() {
  return {
    handoff: {
      handoff_id: 'handoff-ember-lending-escalation-001',
      intent: 'deploy',
      action_summary: 'supply reserved USDC on Aave',
      candidate_unit_ids: ['unit-ember-lending-001'],
      requested_quantities: [
        {
          unit_id: 'unit-ember-lending-001',
          quantity: '10',
        },
      ],
      decision_context: {
        objective_summary: 'deploy reserved capital into the approved lending lane',
        accounting_state_summary: 'reserved capital is still claimed by another agent',
        why_this_path_is_best: 'lending.supply remains the approved path once capital is free',
        consequence_if_delayed: 'reserved capital remains idle',
        alternatives_considered: ['wait for manual intervention'],
      },
      payload_builder_output: {
        transaction_payload_ref: 'tx-lending-supply-001',
        required_control_path: 'lending.supply',
        network: 'arbitrum',
      },
    },
    result: {
      phase: 'blocked',
      transaction_plan_id: 'txplan-ember-lending-001',
      request_result: {
        result: 'needs_release_or_transfer',
        request_id: 'req-ember-lending-blocked-001',
        message: 'reserved capital is still claimed by another agent',
        reservation_id: 'reservation-ember-lending-001',
        blocking_reason_code: 'reserved_for_other_agent',
        next_action: 'escalate_to_control_plane',
      },
      portfolio_state: {
        agent_id: 'ember-lending',
        owned_units: [],
        reservations: [],
      },
    },
  };
}

async function runAgUiCommand(input: {
  baseUrl: string;
  runId: string;
  command: {
    name: string;
    input?: unknown;
  };
  threadId?: string;
}) {
  const response = await fetch(`${input.baseUrl}/agent/${EMBER_LENDING_AGENT_ID}/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      threadId: input.threadId ?? 'thread-1',
      runId: input.runId,
      forwardedProps: {
        command: input.command,
      },
    }),
  });

  expect(response.ok).toBe(true);
  expect(response.headers.get('content-type')).toContain('text/event-stream');

  const events = parseEventStreamBody(await response.text());
  return {
    events,
    snapshot: findStateSnapshot(events),
  };
}

async function runAgUiConnect(input: {
  baseUrl: string;
  threadId?: string;
  runId?: string;
}) {
  const controller = new AbortController();
  const response = await fetch(`${input.baseUrl}/agent/${EMBER_LENDING_AGENT_ID}/connect`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    signal: controller.signal,
    body: JSON.stringify({
      threadId: input.threadId ?? 'thread-connect-1',
      ...(input.runId ? { runId: input.runId } : {}),
    }),
  });

  expect(response.ok).toBe(true);
  expect(response.headers.get('content-type')).toContain('text/event-stream');

  const events = await readEventStreamUntilStateSnapshot(response);
  controller.abort();
  return {
    events,
    snapshot: findStateSnapshot(events),
  };
}

describe('agent-ember-lending AG-UI integration', () => {
  let server: Server;
  let baseUrl: string;
  const defaultHandleJsonRpc = async (input: unknown) => {
    const request =
      typeof input === 'object' && input !== null
        ? (input as { method?: unknown })
        : {};

    switch (request.method) {
      case 'subagent.readPortfolioState.v1':
        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-read-portfolio-state',
          result: {
            protocol_version: 'v1',
            revision: 7,
            portfolio_state: {
              agent_id: 'ember-lending',
              rooted_wallet_context_id: 'rwc-ember-lending-thread-001',
              root_user_wallet: '0x00000000000000000000000000000000000000a1',
              agent_wallet: '0x00000000000000000000000000000000000000b1',
              mandate: {
                mandate_ref: 'mandate-ember-lending-001',
                summary:
                  'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
              },
              reservations: [
                {
                  reservation_id: 'reservation-ember-lending-001',
                  purpose: 'deploy',
                  control_path: 'lending.supply',
                },
              ],
              owned_units: [
                {
                  unit_id: 'unit-ember-lending-001',
                  root_asset: 'USDC',
                  quantity: '10',
                  reservation_id: 'reservation-ember-lending-001',
                },
              ],
            },
          },
        };
      case 'subagent.createTransactionPlan.v1':
        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-materialize-candidate-plan',
          result: {
            protocol_version: 'v1',
            revision: 8,
            committed_event_ids: ['evt-candidate-plan-1'],
            candidate_plan: {
              planning_kind: 'subagent_handoff',
              transaction_plan_id: 'txplan-ember-lending-001',
              handoff: {
                handoff_id: 'handoff-thread-1',
              },
              compact_plan_summary: {
                control_path: 'lending.supply',
                asset: 'USDC',
                amount: '10',
                summary: 'supply reserved USDC on Aave',
              },
            },
          },
        };
      case 'subagent.requestTransactionExecution.v1':
        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-execute-transaction-plan',
          result: {
            protocol_version: 'v1',
            revision: 9,
            committed_event_ids: ['evt-execution-1'],
            execution_result: {
              transaction_plan_id: 'txplan-ember-lending-001',
              execution: {
                execution_id: 'exec-ember-lending-001',
                status: 'confirmed',
                transaction_hash:
                  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
                successor_unit_ids: ['unit-ember-lending-successor-001'],
              },
              portfolio_state: {
                agent_id: 'ember-lending',
                agent_wallet: '0x00000000000000000000000000000000000000b1',
                root_user_wallet: '0x00000000000000000000000000000000000000a1',
                mandate_ref: 'mandate-ember-lending-001',
                mandate_summary:
                  'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
                reservations: [
                  {
                    reservation_id: 'reservation-ember-lending-001',
                    purpose: 'deploy',
                    control_path: 'lending.supply',
                  },
                ],
                owned_units: [
                  {
                    unit_id: 'unit-ember-lending-successor-001',
                    root_asset: 'USDC',
                    quantity: '10',
                    reservation_id: 'reservation-ember-lending-001',
                  },
                ],
              },
            },
          },
        };
      case 'subagent.createEscalationRequest.v1':
        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-create-escalation-request',
          result: {
            protocol_version: 'v1',
            revision: 10,
            escalation_request: {
              source: 'subagent_loop',
              request_kind: 'release_or_transfer_request',
              request_id: 'req-ember-lending-escalation-001',
              handoff_id: 'handoff-ember-lending-escalation-001',
            },
          },
        };
      default:
        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
    }
  };
  const protocolHost = {
    handleJsonRpc: vi.fn(defaultHandleJsonRpc),
    readCommittedEventOutbox: vi.fn(async () => ({
      protocol_version: 'v1',
      revision: 8,
      events: [],
    })),
    acknowledgeCommittedEventOutbox: vi.fn(async () => ({
      protocol_version: 'v1',
      revision: 8,
      consumer_id: 'ember-lending',
      acknowledged_through_sequence: 0,
    })),
  };

  beforeEach(async () => {
    const service = await createEmberLendingGatewayService({
      runtimeConfig: {
        model: {
          id: 'openai/gpt-5.4-mini',
          name: 'openai/gpt-5.4-mini',
          api: 'openai-responses',
          provider: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          reasoning: true,
        },
        systemPrompt: 'Managed lending test runtime.',
        tools: [],
        domain: createEmberLendingDomain({
          protocolHost,
          agentId: 'ember-lending',
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

    const handler = createEmberLendingAgUiHandler({
      agentId: EMBER_LENDING_AGENT_ID,
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
    protocolHost.handleJsonRpc.mockImplementation(defaultHandleJsonRpc);
    protocolHost.readCommittedEventOutbox.mockClear();
    protocolHost.acknowledgeCommittedEventOutbox.mockClear();
  });

  it('hydrates a fresh lending thread on connect so the first snapshot is UI-ready', async () => {
    const { snapshot } = await runAgUiConnect({
      baseUrl,
      threadId: 'thread-connect-1',
      runId: 'run-connect-1',
    });

    expect(snapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'active',
            mandateRef: 'mandate-ember-lending-001',
            walletAddress: '0x00000000000000000000000000000000000000b1',
            rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
            rootedWalletContextId: 'rwc-ember-lending-thread-001',
            lastReservationSummary:
              'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
          },
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.readPortfolioState.v1',
        params: {
          agent_id: 'ember-lending',
        },
      }),
    );
  });

  it('does not fabricate handoff identity over AG-UI when the live portfolio payload omits it', async () => {
    protocolHost.handleJsonRpc.mockImplementation(async (input: unknown) => {
      const request =
        typeof input === 'object' && input !== null
          ? (input as { method?: unknown })
          : {};

      switch (request.method) {
        case 'subagent.readPortfolioState.v1':
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-lean-read-portfolio-state',
            result: {
              protocol_version: 'v1',
              revision: 7,
              portfolio_state: {
                agent_id: 'ember-lending',
                owned_units: [
                  {
                    unit_id: 'unit-emberlendingprimary-thread-001',
                    network: 'arbitrum',
                    wallet_address: '0x00000000000000000000000000000000000000a1',
                    root_asset: 'USDC',
                    quantity: '10',
                    reservation_id: 'reservation-emberlendingprimary-thread-001',
                  },
                ],
                reservations: [
                  {
                    reservation_id: 'reservation-emberlendingprimary-thread-001',
                    purpose: 'deploy',
                    control_path: 'lending.supply',
                  },
                ],
              },
            },
          };
        case 'subagent.createTransactionPlan.v1':
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-lean-materialize-candidate-plan',
            result: {
              protocol_version: 'v1',
              revision: 8,
              committed_event_ids: ['evt-candidate-plan-lean-1'],
              candidate_plan: {
                planning_kind: 'subagent_handoff',
                transaction_plan_id: 'txplan-ember-lending-lean-001',
                handoff: {
                  handoff_id: 'handoff-thread-lean-1',
                },
                compact_plan_summary: {
                  control_path: 'lending.supply',
                  asset: 'USDC',
                  amount: '10',
                  summary: 'supply reserved USDC on Aave',
                },
              },
            },
          };
        default:
          throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }
    });

    const { snapshot: connectSnapshot } = await runAgUiConnect({
      baseUrl,
      threadId: 'thread-lean-1',
      runId: 'run-connect-lean-1',
    });

    expect(connectSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'active',
            mandateRef: null,
            walletAddress: null,
            rootUserWalletAddress: null,
            rootedWalletContextId: null,
          },
        },
      },
    });

    const { snapshot: planSnapshot } = await runAgUiCommand({
      baseUrl,
      threadId: 'thread-lean-1',
      runId: 'run-plan-lean-1',
      command: {
        name: 'create_transaction_plan',
        input: createCandidatePlanInput(),
      },
    });

    expect(planSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'active',
            mandateRef: null,
            walletAddress: null,
            rootUserWalletAddress: null,
            rootedWalletContextId: null,
            lastCandidatePlanSummary: null,
          },
        },
      },
    });

    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.createTransactionPlan.v1',
      }),
    );
  });

  it('serves lending candidate-plan materialization over real AG-UI HTTP endpoints after connect hydration', async () => {
    const { events: connectEvents, snapshot: connectSnapshot } = await runAgUiConnect({
      baseUrl,
      threadId: 'thread-plan-1',
      runId: 'run-connect-plan',
    });

    expect(connectSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'active',
            mandateRef: 'mandate-ember-lending-001',
            walletAddress: '0x00000000000000000000000000000000000000b1',
            rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
            rootedWalletContextId: 'rwc-ember-lending-thread-001',
            lastReservationSummary:
              'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
          },
          artifacts: {
            current: {
              data: {
                type: 'shared-ember-portfolio-state',
                revision: 7,
              },
            },
          },
        },
      },
    });

    const { events: planEvents, snapshot: planSnapshot } = await runAgUiCommand({
      baseUrl,
      threadId: 'thread-plan-1',
      runId: 'run-plan',
      command: {
        name: 'create_transaction_plan',
        input: createCandidatePlanInput(),
      },
    });

    expect(planSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'active',
            lastCandidatePlanSummary: 'supply reserved USDC on Aave',
          },
          artifacts: {
            current: {
              data: {
                type: 'shared-ember-candidate-plan',
                revision: 8,
                candidatePlan: {
                  transaction_plan_id: 'txplan-ember-lending-001',
                },
              },
            },
          },
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.createTransactionPlan.v1',
        params: expect.objectContaining({
          handoff: expect.objectContaining({
            agent_id: 'ember-lending',
            agent_wallet: '0x00000000000000000000000000000000000000b1',
            mandate_ref: 'mandate-ember-lending-001',
          }),
        }),
      }),
    );
  });

  it('serves lending execution over real AG-UI HTTP endpoints', async () => {
    await runAgUiConnect({
      baseUrl,
      threadId: 'thread-execute-1',
      runId: 'run-connect-execute',
    });

    await runAgUiCommand({
      baseUrl,
      threadId: 'thread-execute-1',
      runId: 'run-plan',
      command: {
        name: 'create_transaction_plan',
        input: createCandidatePlanInput(),
      },
    });

    const { snapshot: executeSnapshot } = await runAgUiCommand({
      baseUrl,
      threadId: 'thread-execute-1',
      runId: 'run-execute',
      command: {
        name: 'request_transaction_execution',
      },
    });

    expect(executeSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'active',
            lastExecutionTxHash:
              '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            lastReservationSummary:
              'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
          },
          artifacts: {
            current: {
              data: {
                type: 'shared-ember-execution-result',
                revision: 9,
                executionResult: {
                  transaction_plan_id: 'txplan-ember-lending-001',
                },
              },
            },
          },
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.requestTransactionExecution.v1',
        params: expect.objectContaining({
          expected_revision: 8,
          transaction_plan_id: 'txplan-ember-lending-001',
        }),
      }),
    );
  });

  it('serves lending escalation requests over real AG-UI HTTP endpoints', async () => {
    await runAgUiConnect({
      baseUrl,
      threadId: 'thread-escalation-1',
      runId: 'run-connect-escalation',
    });

    const { snapshot: escalationSnapshot } = await runAgUiCommand({
      baseUrl,
      threadId: 'thread-escalation-1',
      runId: 'run-escalation',
      command: {
        name: 'create_escalation_request',
        input: createEscalationRequestInput(),
      },
    });

    expect(escalationSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'active',
            lastEscalationSummary:
              'release_or_transfer_request escalation req-ember-lending-escalation-001 created from blocked lending execution.',
          },
          artifacts: {
            current: {
              data: {
                type: 'shared-ember-escalation-request',
                revision: 10,
                escalationRequest: {
                  request_id: 'req-ember-lending-escalation-001',
                },
              },
            },
          },
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.createEscalationRequest.v1',
        params: expect.objectContaining({
          handoff: expect.objectContaining({
            agent_id: 'ember-lending',
            agent_wallet: '0x00000000000000000000000000000000000000b1',
            mandate_ref: 'mandate-ember-lending-001',
          }),
          result: expect.objectContaining({
            phase: 'blocked',
            transaction_plan_id: 'txplan-ember-lending-001',
          }),
        }),
      }),
    );
  });
});
