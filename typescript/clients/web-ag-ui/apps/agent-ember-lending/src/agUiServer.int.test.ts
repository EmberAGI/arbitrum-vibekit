import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEmberLendingAgUiHandler,
  createEmberLendingGatewayService,
  EMBER_LENDING_AGENT_ID,
} from './agUiServer.js';
import { createEmberLendingDomain } from './sharedEmberAdapter.js';

const TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX =
  '0x02e982a4b1018405f5e100843b9aca008252089400000000000000000000000000000000000000c18080c0';
const TEST_TRANSACTION_SIGNATURE =
  '0x464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601';

function createAnchoredPayloadResolverStub() {
  return {
    anchorCandidatePlanPayload: vi.fn(async () => ({
      anchoredPayloadRef: 'txpayload-ember-lending-001',
      transactionRequests: [
        {
          type: 'EVM_TX' as const,
          to: '0x00000000000000000000000000000000000000c1',
          value: '0',
          data: '0x095ea7b3',
          chainId: '42161',
        },
        {
          type: 'EVM_TX' as const,
          to: '0x00000000000000000000000000000000000000d2',
          value: '0',
          data: '0x617ba037',
          chainId: '42161',
        },
      ],
      controlPath: 'lending.supply',
      network: 'arbitrum',
      transactionPlanId: 'txplan-ember-lending-001',
    })),
    resolvePreparedUnsignedTransaction: vi.fn(
      async () => TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX,
    ),
  };
}

type AgUiEventEnvelope = {
  type: string;
  [key: string]: unknown;
};

type InternalPostgresStatement = {
  tableName: string;
  values: readonly unknown[];
};

type InternalPersistDirectExecutionOptions = {
  threadId: string;
  threadKey: string;
  threadState: Record<string, unknown>;
  now: Date;
};

type PersistedThreadRecord = {
  threadId: string;
  threadKey: string;
  status: string;
  threadState: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPersistedLifecycleState(
  threads: Iterable<PersistedThreadRecord> | unknown,
  threadId: string,
): Record<string, unknown> | null {
  if (!Array.isArray(threads) && !(Symbol.iterator in Object(threads))) {
    return null;
  }

  const threadList = Array.isArray(threads) ? threads : [...(threads as Iterable<PersistedThreadRecord>)];

  const threadRecord =
    threadList.find(
      (candidate) =>
        isRecord(candidate) &&
        (candidate['threadId'] === threadId || candidate['threadKey'] === threadId) &&
        isRecord(candidate['threadState']) &&
        isRecord(candidate['threadState']['__agentRuntimeDomainState']),
    ) ?? null;

  if (!isRecord(threadRecord) || !isRecord(threadRecord['threadState'])) {
    return null;
  }

  const domainState = threadRecord['threadState']['__agentRuntimeDomainState'];
  return isRecord(domainState) ? domainState : null;
}

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

function createPersistingInternalPostgres() {
  const persistedThreads = new Map<string, PersistedThreadRecord>();

  return {
    persistedThreads,
    hooks: {
      ensureReady: vi.fn(async () => ({
        databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      })),
      loadInspectionState: vi.fn(async () => ({
        threads: [...persistedThreads.values()],
        executions: [],
        automations: [],
        automationRuns: [],
        interrupts: [],
        leases: [],
        outboxIntents: [],
        executionEvents: [],
        threadActivities: [],
      })),
      executeStatements: vi.fn(
        async (_databaseUrl: string, statements: readonly InternalPostgresStatement[]) => {
          for (const statement of statements) {
            if (statement.tableName !== 'pi_threads') {
              continue;
            }

            const [threadId, threadKey, status, threadStateValue, createdAt, updatedAt] =
              statement.values;
            persistedThreads.set(threadKey as string, {
              threadId: threadId as string,
              threadKey: threadKey as string,
              status: status as string,
              threadState:
                typeof threadStateValue === 'string'
                  ? (JSON.parse(threadStateValue) as Record<string, unknown>)
                  : (threadStateValue as Record<string, unknown>),
              createdAt: createdAt as Date,
              updatedAt: updatedAt as Date,
            });
          }
        },
      ),
      persistDirectExecution: vi.fn(async (options: unknown) => {
        const params = options as InternalPersistDirectExecutionOptions;
        persistedThreads.set(params.threadKey, {
          threadId: params.threadId,
          threadKey: params.threadKey,
          status: 'active',
          threadState: params.threadState,
          createdAt: params.now,
          updatedAt: params.now,
        });
      }),
    },
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
    handoff: {
      handoff_id: 'handoff-stale-input-should-not-leak',
      raw_reasoning_trace: 'planner requests must not forward raw model reasoning',
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
      raw_reasoning_trace: 'escalation requests must not forward raw model reasoning',
    },
    result: {
      phase: 'blocked',
      transaction_plan_id: 'txplan-ember-lending-001',
      request_id: 'req-ember-lending-blocked-001',
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

function createBlockedExecutionResult(input: {
  result: 'needs_release_or_transfer' | 'denied';
  requestId: string;
  message: string;
  blockingReasonCode: string;
  nextAction: 'escalate_to_control_plane' | 'stop';
}) {
  return {
    phase: 'blocked',
    transaction_plan_id: 'txplan-ember-lending-001',
    request_id: input.requestId,
    request_result: {
      result: input.result,
      request_id: input.requestId,
      message: input.message,
      reservation_id: 'reservation-ember-lending-001',
      blocking_reason_code: input.blockingReasonCode,
      next_action: input.nextAction,
    },
    portfolio_state: {
      agent_id: 'ember-lending',
      owned_units: [],
      reservations: [],
    },
  };
}

function createBlockedPreparationResult(input: {
  result: 'needs_release_or_transfer' | 'denied';
  requestId: string;
  message: string;
  blockingReasonCode: string;
  nextAction: 'escalate_to_control_plane' | 'stop';
}) {
  return {
    phase: 'blocked',
    transaction_plan_id: 'txplan-ember-lending-001',
    request_id: input.requestId,
    request_result: {
      result: input.result,
      request_id: input.requestId,
      message: input.message,
      reservation_id: 'reservation-ember-lending-001',
      blocking_reason_code: input.blockingReasonCode,
      next_action: input.nextAction,
    },
    portfolio_state: {
      agent_id: 'ember-lending',
      owned_units: [],
      reservations: [],
    },
  };
}

function createReadyForExecutionSigningPreparationResult() {
  return {
    phase: 'ready_for_execution_signing',
    transaction_plan_id: 'txplan-ember-lending-001',
    request_id: 'req-ember-lending-execution-001',
    execution_preparation: {
      execution_preparation_id: 'execprep-ember-lending-001',
      transaction_plan_id: 'txplan-ember-lending-001',
      request_id: 'req-ember-lending-execution-001',
      agent_id: 'ember-lending',
      agent_wallet: '0x00000000000000000000000000000000000000b1',
      root_user_wallet: '0x00000000000000000000000000000000000000a1',
      network: 'arbitrum',
      reservation_id: 'reservation-ember-lending-001',
      required_control_path: 'lending.supply',
      canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
      active_delegation_id: 'del-ember-lending-001',
      root_delegation_id: 'root-user-ember-lending-001',
      prepared_at: '2026-04-01T06:15:00.000Z',
      metadata: {
        planned_transaction_payload_ref: 'txpayload-ember-lending-001',
      },
    },
    execution_signing_package: {
      execution_preparation_id: 'execprep-ember-lending-001',
      transaction_plan_id: 'txplan-ember-lending-001',
      request_id: 'req-ember-lending-execution-001',
      active_delegation_id: 'del-ember-lending-001',
      delegation_artifact_ref: 'metamask-delegation:delegation-ember-lending-001',
      root_delegation_artifact_ref: 'metamask-delegation:root-ember-lending-001',
      canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
    },
  };
}

function createTerminalExecutionResult(input: {
  status:
    | 'submitted'
    | 'confirmed'
    | 'failed_before_submission'
    | 'failed_after_submission'
    | 'partial_settlement';
  transactionHash?: `0x${string}`;
}) {
  return {
    phase: 'completed',
    transaction_plan_id: 'txplan-ember-lending-001',
    request_id: 'req-ember-lending-execution-001',
    execution: {
      execution_id: 'exec-ember-lending-001',
      status: input.status,
      transaction_hash: input.transactionHash ?? null,
      successor_unit_ids:
        input.status === 'failed_before_submission' ? [] : ['unit-ember-lending-successor-001'],
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
  let service: Awaited<ReturnType<typeof createEmberLendingGatewayService>>;
  let persistedPostgres: ReturnType<typeof createPersistingInternalPostgres>;
  let runtimeSigning: {
    readAddress: ReturnType<typeof vi.fn>;
    signPayload: ReturnType<typeof vi.fn>;
  };
  let anchoredPayloadResolver: ReturnType<typeof createAnchoredPayloadResolverStub>;
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
      case 'subagent.readExecutionContext.v1':
        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-read-execution-context',
          result: {
            protocol_version: 'v1',
            revision: 11,
            execution_context: {
              generated_at: '2026-04-01T06:00:00.000Z',
              network: 'arbitrum',
              mandate_ref: 'mandate-ember-lending-001',
              mandate_summary:
                'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
              mandate_context: {
                network: 'arbitrum',
                protocol: 'aave',
              },
              subagent_wallet_address: '0x00000000000000000000000000000000000000b1',
              root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
              owned_units: [
                {
                  unit_id: 'unit-ember-lending-001',
                  root_asset: 'USDC',
                  amount: '10',
                  benchmark_value_usd: '10.00',
                },
              ],
              wallet_contents: [
                {
                  asset: 'USDC',
                  amount: '10',
                  benchmark_value_usd: '10.00',
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
                payload_builder_output: {
                  transaction_payload_ref: 'txpayload-ember-lending-001',
                  required_control_path: 'lending.supply',
                  network: 'arbitrum',
                },
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
          id: 'shared-ember-thread-1-request-transaction-execution',
          result: {
            protocol_version: 'v1',
            revision: 9,
            committed_event_ids: ['evt-prepare-execution-1'],
            execution_result: createReadyForExecutionSigningPreparationResult(),
          },
        };
      case 'subagent.submitSignedTransaction.v1':
        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-submit-signed-transaction',
          result: {
            protocol_version: 'v1',
            revision: 10,
            committed_event_ids: ['evt-submit-execution-1'],
            execution_result: createTerminalExecutionResult({
              status: 'confirmed',
              transactionHash:
                '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            }),
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
    anchoredPayloadResolver = createAnchoredPayloadResolverStub();
    persistedPostgres = createPersistingInternalPostgres();
    runtimeSigning = {
      readAddress: vi.fn(async () => '0x00000000000000000000000000000000000000b1'),
      signPayload: vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000b1',
        signedPayload: {
          signature: TEST_TRANSACTION_SIGNATURE,
          recoveryId: 1,
        },
      })),
    };
    service = await createEmberLendingGatewayService({
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
          runtimeSigning,
          anchoredPayloadResolver,
          runtimeSignerRef: 'service-wallet',
          agentId: 'ember-lending',
        }),
        agentOptions: {
          initialState: {
            thinkingLevel: 'low',
          },
          getApiKey: () => 'test-openrouter-key',
        },
      },
      __internalPostgres: persistedPostgres.hooks,
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
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.readExecutionContext.v1',
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

  it('hydrates a managed lending thread from execution context with a non-null subagent wallet when the portfolio state is still empty', async () => {
    protocolHost.handleJsonRpc.mockImplementation(async (input: unknown) => {
      const request =
        typeof input === 'object' && input !== null
          ? (input as { method?: unknown })
          : {};

      switch (request.method) {
        case 'subagent.readPortfolioState.v1':
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-execctx-read-portfolio-state',
            result: {
              protocol_version: 'v1',
              revision: 9,
              portfolio_state: {
                agent_id: 'ember-lending',
                owned_units: [],
                reservations: [],
              },
            },
          };
        case 'subagent.readExecutionContext.v1':
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-execctx-read-execution-context',
            result: {
              protocol_version: 'v1',
              revision: 10,
              execution_context: {
                generated_at: '2026-04-01T06:30:00.000Z',
                network: 'arbitrum',
                mandate_ref: 'mandate-ember-lending-001',
                mandate_summary:
                  'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
                mandate_context: null,
                subagent_wallet_address: '0x00000000000000000000000000000000000000b1',
                root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
                owned_units: [],
                wallet_contents: [],
              },
            },
          };
        default:
          throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }
    });

    const { snapshot } = await runAgUiConnect({
      baseUrl,
      threadId: 'thread-connect-execution-context-1',
      runId: 'run-connect-execution-context-1',
    });

    expect(snapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'active',
            mandateRef: 'mandate-ember-lending-001',
            mandateSummary:
              'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
            mandateContext: {
              network: 'arbitrum',
            },
            walletAddress: '0x00000000000000000000000000000000000000b1',
            rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
            rootedWalletContextId: null,
            lastReservationSummary: null,
          },
        },
      },
    });
  });

  it('rehydrates an existing lending thread on reconnect when the cached projection is only a stale partial wallet snapshot', async () => {
    let executionContextRevision = 2;

    protocolHost.handleJsonRpc.mockImplementation(async (input: unknown) => {
      const request =
        typeof input === 'object' && input !== null
          ? (input as { method?: unknown })
          : {};

      switch (request.method) {
        case 'subagent.readPortfolioState.v1':
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-stale-read-portfolio-state',
            result: {
              protocol_version: 'v1',
              revision: executionContextRevision,
              portfolio_state: {
                agent_id: 'ember-lending',
                owned_units: [],
                reservations: [],
              },
            },
          };
        case 'subagent.readExecutionContext.v1':
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-stale-read-execution-context',
            result: {
              protocol_version: 'v1',
              revision: executionContextRevision,
              execution_context:
                executionContextRevision === 2
                  ? {
                      generated_at: '2026-04-01T06:30:00.000Z',
                      network: 'arbitrum',
                      mandate_ref: null,
                      mandate_summary: null,
                      mandate_context: null,
                      subagent_wallet_address: '0x00000000000000000000000000000000000000b1',
                      root_user_wallet_address: null,
                      owned_units: [],
                      wallet_contents: [],
                    }
                  : {
                      generated_at: '2026-04-01T06:31:00.000Z',
                      network: 'arbitrum',
                      mandate_ref: 'mandate-ember-lending-001',
                      mandate_summary:
                        'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
                      mandate_context: null,
                      subagent_wallet_address: '0x00000000000000000000000000000000000000b1',
                      root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
                      owned_units: [
                        {
                          unit_id: 'unit-ember-lending-001',
                          root_asset: 'USDC',
                          amount: '10',
                          benchmark_value_usd: '10',
                        },
                      ],
                      wallet_contents: [
                        {
                          asset: 'USDC',
                          amount: '10',
                          benchmark_value_usd: '10',
                        },
                      ],
                    },
            },
          };
        default:
          throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }
    });

    const { snapshot: firstSnapshot } = await runAgUiConnect({
      baseUrl,
      threadId: 'thread-connect-stale-refresh-1',
      runId: 'run-connect-stale-refresh-1',
    });

    expect(firstSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'active',
            mandateRef: null,
            walletAddress: '0x00000000000000000000000000000000000000b1',
            rootUserWalletAddress: null,
          },
        },
      },
    });

    executionContextRevision = 3;

    const { snapshot: secondSnapshot } = await runAgUiConnect({
      baseUrl,
      threadId: 'thread-connect-stale-refresh-1',
      runId: 'run-connect-stale-refresh-2',
    });

    expect(secondSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'active',
            mandateRef: 'mandate-ember-lending-001',
            mandateSummary:
              'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
            mandateContext: {
              network: 'arbitrum',
            },
            walletAddress: '0x00000000000000000000000000000000000000b1',
            rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
          },
        },
      },
    });

    const persistedLifecycle = readPersistedLifecycleState(
      persistedPostgres.persistedThreads.values(),
      'thread-connect-stale-refresh-1',
    );

    expect(persistedLifecycle).toMatchObject({
      mandateRef: 'mandate-ember-lending-001',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
      lastSharedEmberRevision: 3,
      lastPortfolioState: {
        agent_id: 'ember-lending',
        owned_units: [],
        reservations: [],
      },
    });
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
                revision: 11,
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
            mandate_ref: 'mandate-ember-lending-001',
          }),
        }),
      }),
    );
    expect(anchoredPayloadResolver.anchorCandidatePlanPayload).toHaveBeenCalledWith({
      agentId: 'ember-lending',
      threadId: 'thread-plan-1',
      transactionPlanId: 'txplan-ember-lending-001',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
      payloadBuilderOutput: {
        transaction_payload_ref: 'txpayload-ember-lending-001',
        required_control_path: 'lending.supply',
        network: 'arbitrum',
      },
      compactPlanSummary: {
        control_path: 'lending.supply',
        asset: 'USDC',
        amount: '10',
        summary: 'supply reserved USDC on Aave',
      },
    });
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.createTransactionPlan.v1',
        params: expect.objectContaining({
          handoff: expect.objectContaining({
            payload_builder_output: expect.anything(),
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
                revision: 10,
                outcome: 'confirmed',
                transactionHash:
                  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
              },
            },
          },
        },
      },
    });

    expect(runtimeSigning.signPayload).toHaveBeenCalledWith({
      signerRef: 'service-wallet',
      expectedAddress: '0x00000000000000000000000000000000000000b1',
      payloadKind: 'transaction',
      payload: {
        chain: 'evm',
        unsignedTransactionHex: TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX,
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
    expect(anchoredPayloadResolver.resolvePreparedUnsignedTransaction).toHaveBeenCalledWith({
      agentId: 'ember-lending',
      canonicalUnsignedPayloadRef: 'unsigned-txpayload-ember-lending-001',
      delegationArtifactRef: 'metamask-delegation:delegation-ember-lending-001',
      executionPreparationId: 'execprep-ember-lending-001',
      network: 'arbitrum',
      plannedTransactionPayloadRef: 'txpayload-ember-lending-001',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      requestId: 'req-ember-lending-execution-001',
      rootDelegationArtifactRef: 'metamask-delegation:root-ember-lending-001',
      requiredControlPath: 'lending.supply',
      transactionPlanId: 'txplan-ember-lending-001',
      anchoredPayloadRecords: [
        {
          anchoredPayloadRef: 'txpayload-ember-lending-001',
          transactionRequests: [
            {
              type: 'EVM_TX',
              to: '0x00000000000000000000000000000000000000c1',
              value: '0',
              data: '0x095ea7b3',
              chainId: '42161',
            },
            {
              type: 'EVM_TX',
              to: '0x00000000000000000000000000000000000000d2',
              value: '0',
              data: '0x617ba037',
              chainId: '42161',
            },
          ],
          controlPath: 'lending.supply',
          network: 'arbitrum',
          transactionPlanId: 'txplan-ember-lending-001',
        },
      ],
    });
  });

  it('serves blocked lending execution requests over real AG-UI HTTP endpoints without claiming execution success', async () => {
    protocolHost.handleJsonRpc.mockImplementation(async (input: unknown) => {
      const request =
        typeof input === 'object' && input !== null
          ? (input as { method?: unknown })
          : {};

      if (request.method === 'subagent.requestTransactionExecution.v1') {
        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-request-transaction-execution',
          result: {
            protocol_version: 'v1',
            revision: 9,
            committed_event_ids: ['evt-execution-blocked-1'],
            execution_result: createBlockedPreparationResult({
              result: 'needs_release_or_transfer',
              requestId: 'req-ember-lending-blocked-001',
              message: 'reserved capital is still claimed by another agent',
              blockingReasonCode: 'reserved_for_other_agent',
              nextAction: 'escalate_to_control_plane',
            }),
          },
        };
      }

      return defaultHandleJsonRpc(input);
    });

    await runAgUiConnect({
      baseUrl,
      threadId: 'thread-execute-blocked-1',
      runId: 'run-connect-execute-blocked',
    });

    await runAgUiCommand({
      baseUrl,
      threadId: 'thread-execute-blocked-1',
      runId: 'run-plan-blocked',
      command: {
        name: 'create_transaction_plan',
        input: createCandidatePlanInput(),
      },
    });

    const { snapshot: executeSnapshot } = await runAgUiCommand({
      baseUrl,
      threadId: 'thread-execute-blocked-1',
      runId: 'run-execute-blocked',
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
            lastReservationSummary:
              'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
          },
          artifacts: {
            current: {
              data: {
                type: 'shared-ember-execution-result',
                revision: 9,
                outcome: 'blocked',
                message:
                  'Lending transaction execution request was blocked by Shared Ember: reserved capital is still claimed by another agent.',
              },
            },
          },
        },
      },
    });
  });

  it('serves denied lending execution requests over real AG-UI HTTP endpoints with the denied admission artifact', async () => {
    protocolHost.handleJsonRpc.mockImplementation(async (input: unknown) => {
      const request =
        typeof input === 'object' && input !== null
          ? (input as { method?: unknown })
          : {};

      if (request.method === 'subagent.requestTransactionExecution.v1') {
        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-request-transaction-execution',
          result: {
            protocol_version: 'v1',
            revision: 9,
            committed_event_ids: ['evt-execution-denied-1'],
            execution_result: createBlockedPreparationResult({
              result: 'denied',
              requestId: 'req-ember-lending-denied-001',
              message: 'risk policy denied the requested lending path',
              blockingReasonCode: 'policy_denied',
              nextAction: 'stop',
            }),
          },
        };
      }

      return defaultHandleJsonRpc(input);
    });

    await runAgUiConnect({
      baseUrl,
      threadId: 'thread-execute-denied-1',
      runId: 'run-connect-execute-denied',
    });

    await runAgUiCommand({
      baseUrl,
      threadId: 'thread-execute-denied-1',
      runId: 'run-plan-denied',
      command: {
        name: 'create_transaction_plan',
        input: createCandidatePlanInput(),
      },
    });

    const { snapshot: executeSnapshot } = await runAgUiCommand({
      baseUrl,
      threadId: 'thread-execute-denied-1',
      runId: 'run-execute-denied',
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
            lastReservationSummary:
              'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
          },
          artifacts: {
            current: {
              data: {
                type: 'shared-ember-execution-result',
                revision: 9,
                outcome: 'denied',
                message:
                  'Lending transaction execution request was denied by Shared Ember: risk policy denied the requested lending path.',
              },
            },
          },
        },
      },
    });
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
