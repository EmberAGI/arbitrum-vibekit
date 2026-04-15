import { describe, expect, it, vi } from 'vitest';

import type { AgentRuntimeService } from 'agent-runtime';
import type { EmberLendingAgentConfig } from './emberLendingFoundation.js';

import { createEmberLendingGatewayService } from './agUiServer.js';

const TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX =
  '0x02e982a4b1018405f5e100843b9aca008252089400000000000000000000000000000000000000c18080c0';
const TEST_TRANSACTION_SIGNATURE =
  '0x464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601';

function createStubService(): AgentRuntimeService {
  return {
    connect: async () => [],
    run: async () => [],
    stop: async () => [],
    control: {
      inspectHealth: async () => ({ status: 'ok' }),
      listThreads: async () => [],
      listExecutions: async () => [],
      listAutomations: async () => [],
      listAutomationRuns: async () => [],
      inspectScheduler: async () => ({ dueAutomationIds: [], leases: [] }),
      inspectOutbox: async () => ({ dueOutboxIds: [], intents: [] }),
      inspectMaintenance: async () => ({ recovery: {}, archival: {} }),
    },
    createAgUiHandler: () => async () => new Response(null),
  };
}

function createManagedLifecycleState() {
  return {
    phase: 'active' as const,
    mandateRef: 'mandate-ember-lending-001',
    mandateSummary: 'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
    mandateContext: {
      network: 'arbitrum',
      protocol: 'aave',
      allowedCollateralAssets: ['USDC'],
      allowedBorrowAssets: ['USDC'],
      maxAllocationPct: 35,
      maxLtvBps: 7000,
      minHealthFactor: '1.25',
    },
    walletAddress: '0x00000000000000000000000000000000000000b1' as const,
    rootUserWalletAddress: '0x00000000000000000000000000000000000000a1' as const,
    rootedWalletContextId: 'rwc-ember-lending-thread-001',
    lastPortfolioState: {
      agent_id: 'ember-lending',
      owned_units: [
        {
          unit_id: 'unit-ember-lending-001',
          root_asset: 'USDC',
          quantity: '10',
          reservation_id: 'reservation-ember-lending-001',
        },
      ],
      reservations: [
        {
          reservation_id: 'reservation-ember-lending-001',
          purpose: 'position.enter',
          control_path: 'lending.supply',
        },
      ],
    },
    lastSharedEmberRevision: 7,
    lastReservationSummary: 'Reservation reservation-ember-lending-001 supplies 10 USDC via lending.supply.',
    lastCandidatePlan: null,
    lastCandidatePlanSummary: null,
    anchoredPayloadRecords: [],
    lastExecutionResult: null,
    lastExecutionTxHash: null,
    pendingExecutionSubmission: null,
    lastEscalationRequest: null,
    lastEscalationSummary: null,
  };
}

function createCandidatePlanInput() {
  return {
    idempotencyKey: 'idem-candidate-plan-001',
    intent: 'position.enter',
    action_summary: 'supply reserved USDC on Aave',
    candidate_unit_ids: ['unit-ember-lending-001'],
    requested_quantities: [
      {
        unit_id: 'unit-ember-lending-001',
        quantity: '10',
      },
    ],
    decision_context: {
      objective_summary: 'supply reserved capital into the approved lending lane',
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

function createTerminalExecutionResult() {
  return {
    phase: 'completed',
    transaction_plan_id: 'txplan-ember-lending-001',
    request_id: 'req-ember-lending-execution-001',
    execution: {
      execution_id: 'exec-ember-lending-001',
      status: 'confirmed' as const,
      transaction_hash:
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const,
      successor_unit_ids: ['unit-ember-lending-successor-001'],
    },
    portfolio_state: {
      agent_id: 'ember-lending',
      agent_wallet: '0x00000000000000000000000000000000000000b1',
      root_user_wallet: '0x00000000000000000000000000000000000000a1',
      mandate_ref: 'mandate-ember-lending-001',
      reservations: [],
      owned_units: [],
    },
  };
}

describe('createEmberLendingGatewayService', () => {
  it('runs service-identity preflight before runtime creation when the live Shared Ember path is configured', async () => {
    const service = createStubService();
    const ensureServiceIdentity = vi.fn(async () => ({
      revision: 2,
      wroteIdentity: false,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000b1',
      },
    }));
    const runtimeCreated = vi.fn();
    const createAgentRuntimeKernel = vi.fn(async ({ createRuntimeOptions }) => {
      const signing = {
        readAddress: vi.fn(async () => '0x00000000000000000000000000000000000000b1' as const),
        signPayload: vi.fn(),
      };
      await createRuntimeOptions({
        signing,
      });
      runtimeCreated();
      return {
        service,
        signing,
      };
    });

    await expect(
      createEmberLendingGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
          EMBER_LENDING_OWS_WALLET_NAME: 'ember-lending-service-wallet',
          EMBER_LENDING_OWS_VAULT_PATH: '/tmp/ember-lending-ows-vault',
        },
        __internalEnsureServiceIdentity: ensureServiceIdentity,
        __internalCreateAgentRuntimeKernel: createAgentRuntimeKernel,
      } as never),
    ).resolves.toBe(service);

    expect(ensureServiceIdentity).toHaveBeenCalledOnce();
    expect(createAgentRuntimeKernel).toHaveBeenCalledOnce();
    const ensureCallOrder = ensureServiceIdentity.mock.invocationCallOrder.at(0);
    const runtimeCallOrder = runtimeCreated.mock.invocationCallOrder.at(0);
    expect(ensureCallOrder).toBeDefined();
    expect(runtimeCallOrder).toBeDefined();
    expect(ensureCallOrder!).toBeLessThan(runtimeCallOrder!);
  });

  it('fails closed before runtime creation when the lending service identity cannot be established', async () => {
    const ensureServiceIdentity = vi.fn(async () => {
      throw new Error(
        'Lending startup identity preflight failed because the configured OWS wallet did not resolve an EVM address.',
      );
    });
    const createAgentRuntimeKernel = vi.fn(async ({ createRuntimeOptions }) => {
      const signing = {
        readAddress: vi.fn(async () => '0x00000000000000000000000000000000000000b1' as const),
        signPayload: vi.fn(),
      };
      await createRuntimeOptions({
        signing,
      });
      throw new Error('runtime creation should not be reached');
    });

    await expect(
      createEmberLendingGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          SHARED_EMBER_BASE_URL: 'http://127.0.0.1:56436',
          EMBER_LENDING_OWS_WALLET_NAME: 'ember-lending-service-wallet',
          EMBER_LENDING_OWS_VAULT_PATH: '/tmp/ember-lending-ows-vault',
        },
        __internalEnsureServiceIdentity: ensureServiceIdentity,
        __internalCreateAgentRuntimeKernel: createAgentRuntimeKernel,
      } as never),
    ).rejects.toThrow(
      'Lending startup identity preflight failed because the configured OWS wallet did not resolve an EVM address.',
    );

    expect(createAgentRuntimeKernel).toHaveBeenCalledOnce();
  });

  it('wires the live gateway dependency resolver into candidate-plan anchoring and prepared execution resolution', async () => {
    const service = createStubService();
    const protocolHost = {
      handleJsonRpc: vi
        .fn()
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-create-transaction-plan',
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
        })
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-request-transaction-execution',
          result: {
            protocol_version: 'v1',
            revision: 9,
            committed_event_ids: ['evt-prepare-execution-1'],
            execution_result: createReadyForExecutionSigningPreparationResult(),
          },
        })
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-submit-signed-transaction',
          result: {
            protocol_version: 'v1',
            revision: 10,
            committed_event_ids: ['evt-submit-execution-1'],
            execution_result: createTerminalExecutionResult(),
          },
        }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 10,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 10,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const anchoredPayloadResolver = {
      anchorCandidatePlanPayload: vi.fn(async () => ({
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
      })),
      resolvePreparedUnsignedTransaction: vi.fn(
        async () => TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX,
      ),
    };
    const resolveGatewayDependencies = vi.fn(() => ({
      protocolHost,
      anchoredPayloadResolver,
    }));
    const ensureServiceIdentity = vi.fn(async () => ({
      revision: 2,
      wroteIdentity: false,
      identity: {
        wallet_address: '0x00000000000000000000000000000000000000b1',
      },
    }));
    let runtimeConfig: EmberLendingAgentConfig | null = null;
    const createAgentRuntimeKernel = vi.fn(async ({ createRuntimeOptions }) => {
      const signing = {
        readAddress: vi.fn(async () => '0x00000000000000000000000000000000000000b1' as const),
        signPayload: vi.fn(async () => ({
          confirmedAddress: '0x00000000000000000000000000000000000000b1' as const,
          signedPayload: {
            signature: TEST_TRANSACTION_SIGNATURE,
            recoveryId: 1,
          },
        })),
      };
      runtimeConfig = await createRuntimeOptions({
        signing,
      });

      return {
        service,
        signing,
      };
    });

    await expect(
      createEmberLendingGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
        },
        __internalResolveGatewayDependencies: resolveGatewayDependencies,
        __internalEnsureServiceIdentity: ensureServiceIdentity,
        __internalCreateAgentRuntimeKernel: createAgentRuntimeKernel,
      } as never),
    ).resolves.toBe(service);

    expect(runtimeConfig).not.toBeNull();
    const candidatePlanResult = await runtimeConfig!.domain.handleOperation?.({
      threadId: 'thread-1',
      state: createManagedLifecycleState(),
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: createCandidatePlanInput(),
      },
    });

    await runtimeConfig!.domain.handleOperation?.({
      threadId: 'thread-1',
      state: candidatePlanResult?.state ?? createManagedLifecycleState(),
      operation: {
        source: 'tool',
        name: 'request_transaction_execution',
      },
    });

    expect(resolveGatewayDependencies).toHaveBeenCalled();
    expect(ensureServiceIdentity).toHaveBeenCalledOnce();
    expect(anchoredPayloadResolver.anchorCandidatePlanPayload).toHaveBeenCalledWith({
      agentId: 'ember-lending',
      threadId: 'thread-1',
      transactionPlanId: 'txplan-ember-lending-001',
      walletAddress: '0x00000000000000000000000000000000000000b1',
      rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
      useMaxRepayAmount: false,
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
});
