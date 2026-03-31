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

describe('agent-ember-lending AG-UI integration', () => {
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
        case 'subagent.materializeCandidatePlan.v1':
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
        default:
          throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }
    }),
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
    protocolHost.handleJsonRpc.mockClear();
    protocolHost.readCommittedEventOutbox.mockClear();
    protocolHost.acknowledgeCommittedEventOutbox.mockClear();
  });

  it('serves lending state refresh and candidate-plan materialization over real AG-UI HTTP endpoints', async () => {
    const refreshResponse = await fetch(`${baseUrl}/agent/${EMBER_LENDING_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-1',
        runId: 'run-refresh',
        forwardedProps: {
          command: {
            name: 'read_portfolio_state',
          },
        },
      }),
    });

    expect(refreshResponse.ok).toBe(true);
    expect(refreshResponse.headers.get('content-type')).toContain('text/event-stream');
    const refreshEvents = parseEventStreamBody(await refreshResponse.text());
    const refreshSnapshot = findStateSnapshot(refreshEvents);

    expect(refreshSnapshot).toMatchObject({
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

    const planResponse = await fetch(`${baseUrl}/agent/${EMBER_LENDING_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-1',
        runId: 'run-plan',
        forwardedProps: {
          command: {
            name: 'materialize_candidate_plan',
            input: createCandidatePlanInput(),
          },
        },
      }),
    });

    expect(planResponse.ok).toBe(true);
    const planEvents = parseEventStreamBody(await planResponse.text());
    const planSnapshot = findStateSnapshot(planEvents);

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
        method: 'subagent.materializeCandidatePlan.v1',
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
});
