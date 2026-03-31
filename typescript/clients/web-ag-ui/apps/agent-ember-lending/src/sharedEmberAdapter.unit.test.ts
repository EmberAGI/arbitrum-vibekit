import { describe, expect, it, vi } from 'vitest';

import { createEmberLendingDomain } from './sharedEmberAdapter.js';

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
          purpose: 'deploy',
          control_path: 'lending.supply',
        },
      ],
    },
    lastSharedEmberRevision: 7,
    lastReservationSummary: 'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
    lastCandidatePlan: null,
    lastCandidatePlanSummary: null,
    lastExecutionResult: null,
    lastExecutionTxHash: null,
    lastEscalationRequest: null,
    lastEscalationSummary: null,
  };
}

function createPortfolioStateResponse() {
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
          context: {
            network: 'arbitrum',
            protocol: 'aave',
            allowedCollateralAssets: ['USDC'],
            allowedBorrowAssets: ['USDC'],
            maxAllocationPct: 35,
            maxLtvBps: 7000,
            minHealthFactor: '1.25',
          },
        },
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
            purpose: 'deploy',
            control_path: 'lending.supply',
          },
        ],
      },
    },
  };
}

function createLeanPortfolioStateResponse() {
  return {
    jsonrpc: '2.0',
    id: 'shared-ember-thread-1-read-portfolio-state',
    result: {
      protocol_version: 'v1',
      revision: 8,
      portfolio_state: {
        agent_id: 'ember-lending',
        owned_units: [
          {
            unit_id: 'unit-ember-lending-001',
            network: 'arbitrum',
            wallet_address: '0x00000000000000000000000000000000000000b1',
            root_asset: 'USDC',
            quantity: '10',
            reservation_id: 'reservation-ember-lending-001',
          },
        ],
        reservations: [
          {
            reservation_id: 'reservation-ember-lending-001',
            purpose: 'deploy',
            control_path: 'lending.supply',
          },
        ],
      },
    },
  };
}

function createWalletAccountingResponse() {
  return {
    jsonrpc: '2.0',
    id: 'shared-ember-wallet-accounting-portfolio-manager-0x00000000000000000000000000000000000000a1',
    result: {
      protocol_version: 'v1',
      revision: 11,
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
          reserve_policy_configured: true,
          capital_reserved_for_agent: true,
          policy_snapshot_recorded: true,
          agent_active: true,
        },
        rooted_wallet_context: {
          rooted_wallet_context_id: 'rwc-ember-lending-thread-001',
        },
        root_delegation: {
          root_delegation_id: 'root-delegation-001',
        },
        owned_units: [
          {
            unit_id: 'unit-unreserved-001',
            root_asset: 'USDC',
            quantity: '90',
            status: 'available',
            control_path: 'unassigned',
            reservation_id: null,
          },
          {
            unit_id: 'unit-ember-lending-001',
            root_asset: 'USDC',
            quantity: '10',
            status: 'reserved',
            control_path: 'lending.supply',
            reservation_id: 'reservation-ember-lending-001',
          },
        ],
        reservations: [
          {
            reservation_id: 'reservation-ember-lending-001',
            agent_id: 'ember-lending',
            purpose: 'deploy',
            status: 'active',
            control_path: 'lending.supply',
            unit_allocations: [
              {
                unit_id: 'unit-ember-lending-001',
                quantity: '10',
              },
            ],
          },
        ],
      },
    },
  };
}

function createEmptyPortfolioStateResponse() {
  return {
    jsonrpc: '2.0',
    id: 'shared-ember-thread-1-read-portfolio-state',
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

describe('createEmberLendingDomain', () => {
  it('does not allow direct hire onboarding from the lending agent runtime', async () => {
    const domain = createEmberLendingDomain({
      agentId: 'ember-lending',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'prehire',
          mandateRef: null,
          mandateSummary: null,
          mandateContext: null,
          walletAddress: null,
          rootUserWalletAddress: null,
          rootedWalletContextId: null,
          lastPortfolioState: null,
          lastSharedEmberRevision: null,
          lastReservationSummary: null,
          lastCandidatePlan: null,
          lastCandidatePlanSummary: null,
          lastExecutionResult: null,
          lastExecutionTxHash: null,
          lastEscalationRequest: null,
          lastEscalationSummary: null,
        },
        operation: {
          source: 'command',
          name: 'hire',
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'prehire',
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Use the portfolio manager to onboard and activate the managed lending agent.',
        },
      },
    });
  });

  it('reads portfolio state from Shared Ember and projects mandate, wallet, and reservation context', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => createPortfolioStateResponse()),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 7,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 7,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        phase: 'prehire',
        mandateRef: null,
        mandateSummary: null,
        mandateContext: null,
        walletAddress: null,
        rootUserWalletAddress: null,
        rootedWalletContextId: null,
        lastPortfolioState: null,
        lastSharedEmberRevision: null,
        lastReservationSummary: null,
        lastCandidatePlan: null,
        lastCandidatePlanSummary: null,
        lastExecutionResult: null,
        lastExecutionTxHash: null,
        lastEscalationRequest: null,
        lastEscalationSummary: null,
      },
      operation: {
        source: 'tool',
        name: 'read_portfolio_state',
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        mandateRef: 'mandate-ember-lending-001',
        mandateSummary:
          'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
        walletAddress: '0x00000000000000000000000000000000000000b1',
        rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
        rootedWalletContextId: 'rwc-ember-lending-thread-001',
        lastSharedEmberRevision: 7,
        lastReservationSummary:
          'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Lending portfolio state refreshed from Shared Ember Domain Service.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-portfolio-state',
              revision: 7,
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-read-portfolio-state',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'ember-lending',
      },
    });

    const context = await domain.systemContext?.({
      threadId: 'thread-1',
      state: result?.state,
    });

    expect(context).toEqual(
      expect.arrayContaining([
        '  <lifecycle_phase>active</lifecycle_phase>',
        '  <mandate_ref>mandate-ember-lending-001</mandate_ref>',
        '  <subagent_wallet_address>0x00000000000000000000000000000000000000b1</subagent_wallet_address>',
        '  <root_user_wallet_address>0x00000000000000000000000000000000000000a1</root_user_wallet_address>',
        '  <rooted_wallet_context_id>rwc-ember-lending-thread-001</rooted_wallet_context_id>',
      ]),
    );
  });

  it('backfills wallet and lane context from lean portfolio-state payloads', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => createLeanPortfolioStateResponse()),
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
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        phase: 'prehire',
        mandateRef: null,
        mandateSummary: null,
        mandateContext: null,
        walletAddress: null,
        rootUserWalletAddress: null,
        rootedWalletContextId: null,
        lastPortfolioState: null,
        lastSharedEmberRevision: null,
        lastReservationSummary: null,
        lastCandidatePlan: null,
        lastCandidatePlanSummary: null,
        lastExecutionResult: null,
        lastExecutionTxHash: null,
        lastEscalationRequest: null,
        lastEscalationSummary: null,
      },
      operation: {
        source: 'tool',
        name: 'read_portfolio_state',
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        mandateRef: null,
        mandateSummary: null,
        mandateContext: {
          network: 'arbitrum',
          protocol: 'lending',
        },
        walletAddress: '0x00000000000000000000000000000000000000b1',
        rootUserWalletAddress: null,
        rootedWalletContextId: null,
        lastSharedEmberRevision: 8,
        lastReservationSummary:
          'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
      },
    });
  });

  it('injects broader wallet accounting context into system context for escalation decisions', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: unknown };
        if (request.method === 'orchestrator.readOnboardingState.v1') {
          return createWalletAccountingResponse();
        }

        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 11,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 11,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
    });

    const context = await domain.systemContext?.({
      threadId: 'thread-1',
      state: createManagedLifecycleState(),
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-wallet-accounting-portfolio-manager-0x00000000000000000000000000000000000000a1',
      method: 'orchestrator.readOnboardingState.v1',
      params: {
        agent_id: 'portfolio-manager',
        wallet_address: '0x00000000000000000000000000000000000000a1',
        network: 'arbitrum',
      },
    });

    expect(context).toEqual(
      expect.arrayContaining([
        '<shared_ember_accounting_context freshness="live">',
        '  <wallet_address>0x00000000000000000000000000000000000000a1</wallet_address>',
        '  <network>arbitrum</network>',
        '    <reservation reservation_id="reservation-ember-lending-001" agent_id="ember-lending">',
      ]),
    );
  });

  it('does not promote the thread to active when Shared Ember returns no managed-lane projection', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => createEmptyPortfolioStateResponse()),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 9,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 9,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        phase: 'prehire',
        mandateRef: null,
        mandateSummary: null,
        mandateContext: null,
        walletAddress: null,
        rootUserWalletAddress: null,
        rootedWalletContextId: null,
        lastPortfolioState: null,
        lastSharedEmberRevision: null,
        lastReservationSummary: null,
        lastCandidatePlan: null,
        lastCandidatePlanSummary: null,
        lastExecutionResult: null,
        lastExecutionTxHash: null,
        lastEscalationRequest: null,
        lastEscalationSummary: null,
      },
      operation: {
        source: 'tool',
        name: 'read_portfolio_state',
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'prehire',
        lastPortfolioState: {
          agent_id: 'ember-lending',
          owned_units: [],
          reservations: [],
        },
        lastSharedEmberRevision: 9,
      },
    });
  });

  it('materializes candidate plans through the bounded subagent surface using managed state context', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
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
      })),
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
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: createManagedLifecycleState(),
      operation: {
        source: 'tool',
        name: 'materialize_candidate_plan',
        input: createCandidatePlanInput(),
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 8,
        lastCandidatePlanSummary: 'supply reserved USDC on Aave',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Candidate lending plan materialized through Shared Ember.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-candidate-plan',
              revision: 8,
              candidatePlan: {
                transaction_plan_id: 'txplan-ember-lending-001',
              },
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-materialize-candidate-plan',
      method: 'subagent.materializeCandidatePlan.v1',
      params: {
        idempotency_key: 'idem-candidate-plan-001',
        expected_revision: 7,
        handoff: {
          handoff_id: 'handoff-thread-1',
          agent_id: 'ember-lending',
          agent_wallet: '0x00000000000000000000000000000000000000b1',
          root_user_wallet: '0x00000000000000000000000000000000000000a1',
          mandate_ref: 'mandate-ember-lending-001',
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
            mandate_summary:
              'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
            objective_summary: 'deploy reserved capital into the approved lending lane',
            accounting_state_summary:
              'one reserved USDC unit is available for the lending agent',
            why_this_path_is_best: 'lending.supply is the admitted path for this reservation',
            consequence_if_delayed: 'reserved capital remains idle',
            alternatives_considered: ['leave the unit idle'],
          },
          payload_builder_output: {
            transaction_payload_ref: 'tx-lending-supply-001',
            required_control_path: 'lending.supply',
            network: 'arbitrum',
          },
        },
      },
    });
  });

  it('executes the latest candidate plan through the bounded subagent surface and records the tx hash', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-execute-transaction-plan',
        result: {
          protocol_version: 'v1',
          revision: 9,
          committed_event_ids: ['evt-request-execution-2'],
          execution_result: {
            phase: 'completed',
            transaction_plan_id: 'txplan-ember-lending-001',
            execution: {
              execution_id: 'exec-ember-lending-001',
              status: 'confirmed',
              transaction_hash: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
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
      })),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 9,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 9,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        ...createManagedLifecycleState(),
        lastCandidatePlan: {
          transaction_plan_id: 'txplan-ember-lending-001',
        },
        lastCandidatePlanSummary: 'supply reserved USDC on Aave',
      },
      operation: {
        source: 'tool',
        name: 'execute_transaction_plan',
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 9,
        lastExecutionTxHash:
          '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        lastReservationSummary:
          'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Lending transaction plan executed through Shared Ember.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-execution-result',
              revision: 9,
              executionResult: {
                transaction_plan_id: 'txplan-ember-lending-001',
              },
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-execute-transaction-plan',
      method: 'subagent.executeTransactionPlan.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1',
        expected_revision: 7,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
  });

  it('creates escalation requests through the bounded subagent surface and records the escalation summary', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-create-escalation-request',
        result: {
          protocol_version: 'v1',
          revision: 9,
          escalation_request: {
            source: 'subagent_loop',
            request_kind: 'release_or_transfer_request',
            request_id: 'req-ember-lending-escalation-001',
            handoff_id: 'handoff-ember-lending-escalation-001',
          },
        },
      })),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 9,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 9,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        ...createManagedLifecycleState(),
        lastCandidatePlanSummary: 'supply reserved USDC on Aave',
      },
      operation: {
        source: 'tool',
        name: 'create_escalation_request',
        input: {
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
              accounting_state_summary:
                'reserved capital is still claimed by another agent',
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
        },
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastEscalationSummary:
          'release_or_transfer_request escalation req-ember-lending-escalation-001 created from blocked lending execution.',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Lending escalation request created through Shared Ember.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-escalation-request',
              revision: 9,
              escalationRequest: {
                request_id: 'req-ember-lending-escalation-001',
              },
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-create-escalation-request',
      method: 'subagent.createEscalationRequest.v1',
      params: {
        handoff: {
          handoff_id: 'handoff-ember-lending-escalation-001',
          agent_id: 'ember-lending',
          agent_wallet: '0x00000000000000000000000000000000000000b1',
          root_user_wallet: '0x00000000000000000000000000000000000000a1',
          mandate_ref: 'mandate-ember-lending-001',
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
            mandate_summary:
              'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
            objective_summary: 'deploy reserved capital into the approved lending lane',
            accounting_state_summary: 'reserved capital is still claimed by another agent',
            why_this_path_is_best:
              'lending.supply remains the approved path once capital is free',
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
      },
    });
  });
});
