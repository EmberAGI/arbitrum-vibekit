import { describe, expect, it, vi } from 'vitest';

import {
  createEmberLendingDomain,
  EMBER_LENDING_INTERNAL_HYDRATE_COMMAND,
} from './sharedEmberAdapter.js';

function createRuntimeSigningStub(
  signPayload: ReturnType<typeof vi.fn>,
) {
  return {
    readAddress: vi.fn(),
    signPayload,
  };
}

const TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX =
  '0x02e982a4b1018405f5e100843b9aca008252089400000000000000000000000000000000000000c18080c0';
const TEST_TRANSACTION_SIGNATURE =
  '0x464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601';
const TEST_REDELEGATION_SIGNATURE =
  '0x464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601';
const TEST_REDELEGATION_TYPED_DATA = {
  domain: {
    name: 'SharedEmberDelegation',
    version: '1',
    chainId: 42161,
    verifyingContract: '0x00000000000000000000000000000000000000d1',
  },
  types: {
    Redelegation: [
      { name: 'delegationId', type: 'bytes32' },
      { name: 'agentWallet', type: 'address' },
    ],
  },
  primaryType: 'Redelegation',
  message: {
    delegationId: '0x1111111111111111111111111111111111111111111111111111111111111111',
    agentWallet: '0x00000000000000000000000000000000000000b1',
  },
};

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

function createExecutionContextResponse() {
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
          allowedCollateralAssets: ['USDC'],
          allowedBorrowAssets: ['USDC'],
          maxAllocationPct: 35,
          maxLtvBps: 7000,
          minHealthFactor: '1.25',
        },
        subagent_wallet_address: '0x00000000000000000000000000000000000000b1',
        root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
        owned_units: [
          {
            unit_id: 'unit-unreserved-001',
            root_asset: 'USDC',
            amount: '90',
            benchmark_value_usd: '90.00',
          },
        ],
        wallet_contents: [
          {
            asset: 'USDC',
            amount: '100',
            benchmark_value_usd: '100.00',
          },
        ],
      },
    },
  };
}

function createMandatedExecutionContextResponse() {
  return {
    jsonrpc: '2.0',
    id: 'shared-ember-thread-1-read-execution-context',
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
        subagent_wallet_address: null,
        root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
        owned_units: [],
        wallet_contents: [],
      },
    },
  };
}

function createEmptyExecutionContextResponse() {
  return {
    jsonrpc: '2.0',
    id: 'shared-ember-thread-1-read-execution-context',
    result: {
      protocol_version: 'v1',
      revision: 9,
      execution_context: {
        generated_at: '2026-04-01T06:45:00.000Z',
        network: 'arbitrum',
        mandate_ref: null,
        mandate_summary: null,
        mandate_context: null,
        subagent_wallet_address: null,
        root_user_wallet_address: null,
        owned_units: [],
        wallet_contents: [],
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

function createReadyForExecutionSigningPreparationResult(input?: {
  signerWalletAddress?: string;
}) {
  return {
    phase: 'ready_for_execution_signing',
    transaction_plan_id: 'txplan-ember-lending-001',
    request_id: 'req-ember-lending-execution-001',
    execution_preparation: {
      execution_preparation_id: 'execprep-ember-lending-001',
      transaction_plan_id: 'txplan-ember-lending-001',
      request_id: 'req-ember-lending-execution-001',
      agent_id: 'ember-lending',
      agent_wallet:
        input?.signerWalletAddress ?? '0x00000000000000000000000000000000000000b1',
      root_user_wallet: '0x00000000000000000000000000000000000000a1',
      network: 'arbitrum',
      reservation_id: 'reservation-ember-lending-001',
      required_control_path: 'lending.supply',
      canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
      active_delegation_id: 'del-ember-lending-001',
      root_delegation_id: 'root-user-ember-lending-001',
      prepared_at: '2026-04-01T06:15:00.000Z',
      metadata: {},
    },
    execution_signing_package: {
      execution_preparation_id: 'execprep-ember-lending-001',
      transaction_plan_id: 'txplan-ember-lending-001',
      request_id: 'req-ember-lending-execution-001',
      active_delegation_id: 'del-ember-lending-001',
      canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
      unsigned_transaction_hex: TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX,
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

function createAuthorityPreparationRequiredResult() {
  return {
    phase: 'authority_preparation_needed',
    transaction_plan_id: 'txplan-ember-lending-001',
    request_id: 'req-ember-lending-execution-001',
    authority_gap: 'missing_root_delegation',
  };
}

function createReadyForRedelegationSigningPreparationResult() {
  return {
    phase: 'ready_for_redelegation',
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
      canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
      active_delegation_id: 'del-ember-lending-001',
      root_delegation_id: 'root-user-ember-lending-001',
      prepared_at: '2026-04-01T06:15:00.000Z',
      metadata: {},
    },
    redelegation_signing_package: {
      execution_preparation_id: 'execprep-ember-lending-001',
      transaction_plan_id: 'txplan-ember-lending-001',
      request_id: 'req-ember-lending-execution-001',
      redelegation_intent_id: 'reintent-ember-lending-001',
      active_delegation_id: 'del-ember-lending-001',
      delegation_id: 'del-ember-lending-002',
      delegation_plan_id: 'plan-ember-lending-002',
      root_delegation_id: 'root-user-ember-lending-001',
      root_delegation_artifact_ref: 'artifact-root-ember-lending-001',
      delegator_address: '0x00000000000000000000000000000000000000a1',
      agent_id: 'ember-lending',
      agent_wallet: '0x00000000000000000000000000000000000000b1',
      network: 'arbitrum',
      reservation_ids: ['reservation-ember-lending-001'],
      unit_ids: ['unit-ember-lending-001'],
      control_paths: ['lending.supply'],
      zero_capacity: false,
      policy_snapshot_ref: 'pol-ember-lending-001',
      canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
      typed_data: TEST_REDELEGATION_TYPED_DATA,
    },
  };
}

function createReadyForExecutionSigningResult() {
  return createReadyForExecutionSigningPreparationResult();
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
      reservations: [],
      owned_units: [],
    },
  };
}

describe('createEmberLendingDomain', () => {
  it('exposes only the three model-visible lending tools plus managed lifecycle controls', () => {
    const domain = createEmberLendingDomain({
      agentId: 'ember-lending',
    });

    expect(domain.lifecycle.commands.map((command) => command.name)).toEqual([
      'hire',
      'fire',
      'create_transaction_plan',
      'request_transaction_execution',
      'create_escalation_request',
    ]);
  });

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

  it('hydrates runtime projection from Shared Ember and projects mandate, wallet, and reservation context', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: unknown };
        if (request.method === 'subagent.readPortfolioState.v1') {
          return createPortfolioStateResponse();
        }

        if (request.method === 'subagent.readExecutionContext.v1') {
          return createExecutionContextResponse();
        }

        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }),
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
        name: EMBER_LENDING_INTERNAL_HYDRATE_COMMAND,
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
        lastSharedEmberRevision: 11,
        lastReservationSummary:
          'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Lending runtime projection hydrated from Shared Ember Domain Service.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-portfolio-state',
              revision: 11,
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-hydrate-runtime-projection',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'ember-lending',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-read-execution-context',
      method: 'subagent.readExecutionContext.v1',
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
        '<ember_lending_execution_context freshness="live">',
        '  <generated_at>2026-04-01T06:00:00.000Z</generated_at>',
        '  <mandate_ref>mandate-ember-lending-001</mandate_ref>',
        '  <mandate_summary>lend USDC on Aave within medium-risk allocation and health-factor guardrails</mandate_summary>',
        '  <subagent_wallet_address>0x00000000000000000000000000000000000000b1</subagent_wallet_address>',
        '  <root_user_wallet_address>0x00000000000000000000000000000000000000a1</root_user_wallet_address>',
        '  <network>arbitrum</network>',
        '      <benchmark_value_usd>90.00</benchmark_value_usd>',
        '      <benchmark_value_usd>100.00</benchmark_value_usd>',
      ]),
    );
    expect(context).not.toContain('  <lifecycle_phase>active</lifecycle_phase>');
    expect(context).not.toContain(
      '  <rooted_wallet_context_id>rwc-ember-lending-thread-001</rooted_wallet_context_id>',
    );
  });

  it('keeps wallet identity unset for lean execution-context payloads that omit authoritative handoff fields', async () => {
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
        name: EMBER_LENDING_INTERNAL_HYDRATE_COMMAND,
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
        walletAddress: null,
        rootUserWalletAddress: null,
        rootedWalletContextId: null,
        lastSharedEmberRevision: 8,
        lastReservationSummary:
          'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
      },
    });
  });

  it('injects minimal execution context into system context with benchmark-aware wallet data', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: unknown };
        if (request.method === 'subagent.readExecutionContext.v1') {
          return createExecutionContextResponse();
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
      id: 'shared-ember-thread-1-read-execution-context',
      method: 'subagent.readExecutionContext.v1',
      params: {
        agent_id: 'ember-lending',
      },
    });

    expect(context).toEqual(
      expect.arrayContaining([
        '<ember_lending_execution_context freshness="live">',
        '  <generated_at>2026-04-01T06:00:00.000Z</generated_at>',
        '  <network>arbitrum</network>',
        '  <subagent_wallet_address>0x00000000000000000000000000000000000000b1</subagent_wallet_address>',
        '  <root_user_wallet_address>0x00000000000000000000000000000000000000a1</root_user_wallet_address>',
        '      <benchmark_value_usd>100.00</benchmark_value_usd>',
      ]),
    );
    expect(context?.join('\n')).not.toContain('shared_ember_accounting_context');
    expect(context?.join('\n')).not.toContain('<proofs>');
    expect(context?.join('\n')).not.toContain('<reservations>');
  });

  it('does not promote the thread to active when Shared Ember returns no managed-lane execution context', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: unknown };
        if (request.method === 'subagent.readPortfolioState.v1') {
          return createEmptyPortfolioStateResponse();
        }
        if (request.method === 'subagent.readExecutionContext.v1') {
          return createEmptyExecutionContextResponse();
        }

        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }),
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
        name: EMBER_LENDING_INTERNAL_HYDRATE_COMMAND,
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

  it('promotes the thread to active from execution context when the managed portfolio is still empty', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: unknown };
        if (request.method === 'subagent.readPortfolioState.v1') {
          return createEmptyPortfolioStateResponse();
        }
        if (request.method === 'subagent.readExecutionContext.v1') {
          return createMandatedExecutionContextResponse();
        }

        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
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
        name: EMBER_LENDING_INTERNAL_HYDRATE_COMMAND,
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        mandateRef: 'mandate-ember-lending-001',
        mandateSummary:
          'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
        mandateContext: {
          network: 'arbitrum',
        },
        walletAddress: null,
        rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
        rootedWalletContextId: null,
        lastPortfolioState: {
          agent_id: 'ember-lending',
          owned_units: [],
          reservations: [],
        },
        lastSharedEmberRevision: 10,
        lastReservationSummary: null,
      },
    });
  });

  it('fails candidate-plan materialization when lean runtime state omits authoritative handoff fields', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: string };
        if (request.method === 'subagent.createTransactionPlan.v1') {
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
        }

        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
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
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        ...createManagedLifecycleState(),
        mandateRef: null,
        mandateSummary: null,
        mandateContext: {
          network: 'arbitrum',
          protocol: 'lending',
        },
        walletAddress: null,
        rootUserWalletAddress: null,
        rootedWalletContextId: null,
        lastPortfolioState: {
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
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: createCandidatePlanInput(),
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        mandateRef: null,
        walletAddress: null,
        rootUserWalletAddress: null,
        rootedWalletContextId: null,
        lastCandidatePlanSummary: null,
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Lending runtime context is incomplete. Wait for execution-context hydration before planning.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.readOnboardingState.v1',
      }),
    );
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.createTransactionPlan.v1',
      }),
    );
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
        name: 'create_transaction_plan',
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
          statusMessage: 'Candidate lending plan created through the Shared Ember planner.',
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
      id: 'shared-ember-thread-1-create-transaction-plan',
      method: 'subagent.createTransactionPlan.v1',
      params: {
        idempotency_key: 'idem-candidate-plan-001',
        expected_revision: 7,
        handoff: {
          handoff_id: 'handoff-thread-1',
          agent_id: 'ember-lending',
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
        },
      },
    });
  });

  it('fails execution when Shared Ember prepares signing but no direct OWS signer is configured', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-request-transaction-execution',
        result: {
          protocol_version: 'v1',
          revision: 9,
          committed_event_ids: ['evt-prepare-execution-1'],
          execution_result: createReadyForExecutionSigningPreparationResult(),
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
        name: 'request_transaction_execution',
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 9,
        lastExecutionResult: null,
        lastExecutionTxHash: null,
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage: 'Local OWS signer is not configured for lending transaction execution.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-transaction-execution',
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1',
        expected_revision: 7,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
  });

  it('signs execution packages locally and submits them back to Shared Ember before returning the final outcome', async () => {
    const protocolHost = {
      handleJsonRpc: vi
        .fn()
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
            execution_result: createTerminalExecutionResult({
              status: 'confirmed',
              transactionHash:
                '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            }),
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
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000b1',
        signedPayload: {
          signature:
            '0x464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601',
          recoveryId: 1,
        },
      })),
    );
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      runtimeSignerRef: 'service-wallet',
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
        name: 'request_transaction_execution',
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

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-transaction-execution',
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1',
        expected_revision: 7,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-submit-signed-transaction',
      method: 'subagent.submitSignedTransaction.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1:submit-transaction:req-ember-lending-execution-001',
        expected_revision: 9,
        transaction_plan_id: 'txplan-ember-lending-001',
        signed_transaction: expect.objectContaining({
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
          unsigned_transaction_hex: TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX,
          signer_address: '0x00000000000000000000000000000000000000b1',
          raw_transaction: expect.stringMatching(/^0x[0-9a-f]+$/),
        }),
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 10,
        lastExecutionTxHash:
          '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        lastReservationSummary:
          'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Lending transaction execution confirmed through Shared Ember.',
        },
      },
    });
  });

  it('surfaces blocked preparation results from the multi-call execution path without signing or submitting', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-request-transaction-execution',
        result: {
          protocol_version: 'v1',
          revision: 9,
          committed_event_ids: ['evt-prepare-execution-blocked-1'],
          execution_result: createBlockedPreparationResult({
            result: 'needs_release_or_transfer',
            requestId: 'req-ember-lending-blocked-001',
            message: 'reserved capital is still claimed by another agent',
            blockingReasonCode: 'reserved_for_other_agent',
            nextAction: 'escalate_to_control_plane',
          }),
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
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000b1',
        signedPayload: {
          signature: TEST_TRANSACTION_SIGNATURE,
          recoveryId: 1,
        },
      })),
    );
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      runtimeSignerRef: 'service-wallet',
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
        name: 'request_transaction_execution',
      },
    });

    expect(runtimeSigning.signPayload).not.toHaveBeenCalled();
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledTimes(1);

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 9,
        lastExecutionTxHash: null,
        lastExecutionResult: {
          phase: 'blocked',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-blocked-001',
          request_result: {
            result: 'needs_release_or_transfer',
          },
        },
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Lending transaction execution request was blocked by Shared Ember: reserved capital is still claimed by another agent.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-execution-result',
              revision: 9,
              outcome: 'blocked',
              message:
                'Lending transaction execution request was blocked by Shared Ember: reserved capital is still claimed by another agent.',
            },
          },
        ],
      },
    });
  });

  it('fails closed when the prepared execution signing package does not match the dedicated subagent wallet', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-request-transaction-execution',
        result: {
          protocol_version: 'v1',
          revision: 9,
          committed_event_ids: ['evt-prepare-execution-1'],
          execution_result: createReadyForExecutionSigningPreparationResult({
            signerWalletAddress: '0x00000000000000000000000000000000000000c1',
          }),
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
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000b1',
        signedPayload: {
          signature: TEST_TRANSACTION_SIGNATURE,
          recoveryId: 1,
        },
      })),
    );
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      runtimeSignerRef: 'service-wallet',
      agentId: 'ember-lending',
    });

    await expect(
      domain.handleOperation?.({
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
          name: 'request_transaction_execution',
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 9,
        lastExecutionResult: null,
        lastExecutionTxHash: null,
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Lending execution signing could not continue because the prepared signing package does not match the dedicated subagent wallet.',
        },
      },
    });

    expect(runtimeSigning.signPayload).not.toHaveBeenCalled();
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledTimes(1);
  });

  it('retries preparation internally when Shared Ember reports authority preparation is still pending', async () => {
    const protocolHost = {
      handleJsonRpc: vi
        .fn()
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-request-transaction-execution',
          result: {
            protocol_version: 'v1',
            revision: 8,
            committed_event_ids: ['evt-prepare-authority-1'],
            execution_result: createAuthorityPreparationRequiredResult(),
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
            execution_result: {
              ...createTerminalExecutionResult({
                status: 'confirmed',
                transactionHash:
                  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
              }),
            },
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
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000b1',
        signedPayload: {
          signature: TEST_TRANSACTION_SIGNATURE,
          recoveryId: 1,
        },
      })),
    );
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      runtimeSignerRef: 'service-wallet',
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
        name: 'request_transaction_execution',
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-transaction-execution',
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1',
        expected_revision: 7,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-transaction-execution',
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1:await-authority-preparation:8',
        expected_revision: 8,
        transaction_plan_id: 'txplan-ember-lending-001',
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
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(3, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-submit-signed-transaction',
      method: 'subagent.submitSignedTransaction.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1:submit-transaction:req-ember-lending-execution-001',
        expected_revision: 9,
        transaction_plan_id: 'txplan-ember-lending-001',
        signed_transaction: expect.objectContaining({
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
          unsigned_transaction_hex: TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX,
          signer_address: '0x00000000000000000000000000000000000000b1',
          raw_transaction: expect.stringMatching(/^0x[0-9a-f]+$/),
        }),
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 10,
        lastExecutionTxHash:
          '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Lending transaction execution confirmed through Shared Ember.',
        },
      },
    });
  });

  it('signs redelegation artifacts locally before completing execution signing and submission', async () => {
    const protocolHost = {
      handleJsonRpc: vi
        .fn()
        .mockResolvedValueOnce({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-request-transaction-execution',
        result: {
          protocol_version: 'v1',
          revision: 9,
          committed_event_ids: ['evt-prepare-redelegation-1'],
          execution_result: createReadyForRedelegationSigningPreparationResult(),
        },
      })
      .mockResolvedValueOnce({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-register-signed-redelegation',
        result: {
          protocol_version: 'v1',
          revision: 10,
          committed_event_ids: ['evt-submit-redelegation-1'],
            execution_result: createReadyForExecutionSigningResult(),
          },
      })
      .mockResolvedValueOnce({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-submit-signed-transaction',
        result: {
          protocol_version: 'v1',
          revision: 11,
          committed_event_ids: ['evt-submit-execution-1'],
          execution_result: createTerminalExecutionResult({
            status: 'confirmed',
            transactionHash:
              '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          }),
        },
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
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async ({ payloadKind }) => {
        if (payloadKind === 'typed-data') {
          return {
            confirmedAddress: '0x00000000000000000000000000000000000000b1',
            signedPayload: {
              signature: TEST_REDELEGATION_SIGNATURE,
            },
          };
        }

        return {
          confirmedAddress: '0x00000000000000000000000000000000000000b1',
          signedPayload: {
            signature: TEST_TRANSACTION_SIGNATURE,
            recoveryId: 1,
          },
        };
      }),
    );
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      runtimeSignerRef: 'service-wallet',
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
        name: 'request_transaction_execution',
      },
    });

    expect(runtimeSigning.signPayload).toHaveBeenNthCalledWith(1, {
      signerRef: 'service-wallet',
      expectedAddress: '0x00000000000000000000000000000000000000b1',
      payloadKind: 'typed-data',
      payload: {
        chain: 'evm',
        typedData: TEST_REDELEGATION_TYPED_DATA,
      },
    });
    expect(runtimeSigning.signPayload).toHaveBeenNthCalledWith(2, {
      signerRef: 'service-wallet',
      expectedAddress: '0x00000000000000000000000000000000000000b1',
      payloadKind: 'transaction',
      payload: {
        chain: 'evm',
        unsignedTransactionHex: TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX,
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-register-signed-redelegation',
      method: 'orchestrator.registerSignedRedelegation.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1:register-redelegation:req-ember-lending-execution-001',
        expected_revision: 9,
        transaction_plan_id: 'txplan-ember-lending-001',
        signed_redelegation: {
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          redelegation_intent_id: 'reintent-ember-lending-001',
          active_delegation_id: 'del-ember-lending-001',
          delegation_id: 'del-ember-lending-002',
          delegation_plan_id: 'plan-ember-lending-002',
          root_delegation_id: 'root-user-ember-lending-001',
          root_delegation_artifact_ref: 'artifact-root-ember-lending-001',
          delegator_address: '0x00000000000000000000000000000000000000a1',
          agent_id: 'ember-lending',
          agent_wallet: '0x00000000000000000000000000000000000000b1',
          network: 'arbitrum',
          reservation_ids: ['reservation-ember-lending-001'],
          unit_ids: ['unit-ember-lending-001'],
          control_paths: ['lending.supply'],
          zero_capacity: false,
          policy_snapshot_ref: 'pol-ember-lending-001',
          canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
          typed_data: TEST_REDELEGATION_TYPED_DATA,
          signer_address: '0x00000000000000000000000000000000000000b1',
          signature: TEST_REDELEGATION_SIGNATURE,
        },
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(3, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-submit-signed-transaction',
      method: 'subagent.submitSignedTransaction.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1:submit-transaction:req-ember-lending-execution-001',
        expected_revision: 10,
        transaction_plan_id: 'txplan-ember-lending-001',
        signed_transaction: expect.objectContaining({
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
          unsigned_transaction_hex: TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX,
          signer_address: '0x00000000000000000000000000000000000000b1',
          raw_transaction: expect.stringMatching(/^0x[0-9a-f]+$/),
        }),
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 11,
        lastExecutionTxHash:
          '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Lending transaction execution confirmed through Shared Ember.',
        },
      },
    });
  });

  it('maps submitted and terminal execution outcomes from the signed-artifact flow without treating failures as success', async () => {
    const scenarios = [
      {
        status: 'submitted' as const,
        transactionHash:
          '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
        expectedStatus: 'completed' as const,
        expectedMessage: 'Lending transaction submitted through Shared Ember.',
      },
      {
        status: 'failed_before_submission' as const,
        transactionHash: undefined,
        expectedStatus: 'failed' as const,
        expectedMessage: 'Lending transaction failed before submission through Shared Ember.',
      },
      {
        status: 'failed_after_submission' as const,
        transactionHash:
          '0x2222222222222222222222222222222222222222222222222222222222222222' as const,
        expectedStatus: 'failed' as const,
        expectedMessage: 'Lending transaction failed after submission through Shared Ember.',
      },
      {
        status: 'partial_settlement' as const,
        transactionHash:
          '0x3333333333333333333333333333333333333333333333333333333333333333' as const,
        expectedStatus: 'failed' as const,
        expectedMessage: 'Lending transaction reached partial settlement through Shared Ember.',
      },
    ];

    for (const scenario of scenarios) {
      const protocolHost = {
        handleJsonRpc: vi
          .fn()
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
              execution_result: createTerminalExecutionResult({
                status: scenario.status,
                transactionHash: scenario.transactionHash,
              }),
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
      const runtimeSigning = createRuntimeSigningStub(
        vi.fn(async () => ({
          confirmedAddress: '0x00000000000000000000000000000000000000b1',
          signedPayload: {
            signature: TEST_TRANSACTION_SIGNATURE,
            recoveryId: 1,
          },
        })),
      );
      const domain = createEmberLendingDomain({
        protocolHost,
        runtimeSigning,
        runtimeSignerRef: 'service-wallet',
        agentId: 'ember-lending',
      });

      const result = await domain.handleOperation?.({
        threadId: `thread-${scenario.status}`,
        state: {
          ...createManagedLifecycleState(),
          lastCandidatePlan: {
            transaction_plan_id: 'txplan-ember-lending-001',
          },
          lastCandidatePlanSummary: 'supply reserved USDC on Aave',
        },
        operation: {
          source: 'tool',
          name: 'request_transaction_execution',
        },
      });

      expect(result).toMatchObject({
        state: {
          phase: 'active',
          lastSharedEmberRevision: 10,
          lastExecutionTxHash: scenario.transactionHash ?? null,
          lastExecutionResult: {
            phase: 'completed',
            execution: {
              status: scenario.status,
            },
          },
        },
        outputs: {
          status: {
            executionStatus: scenario.expectedStatus,
            statusMessage: scenario.expectedMessage,
          },
        },
      });
    }
  });

  it('retries prepare and submit with refreshed revisions while keeping deterministic idempotency keys', async () => {
    const protocolHost = {
      handleJsonRpc: vi
        .fn()
        .mockRejectedValueOnce(
          new Error(
            'Shared Ember Domain Service JSON-RPC error: protocol_conflict expected_revision=7 actual_revision=8',
          ),
        )
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-read-current-revision',
          result: {
            protocol_version: 'v1',
            revision: 8,
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
        .mockRejectedValueOnce(
          new Error(
            'Shared Ember Domain Service JSON-RPC error: protocol_conflict expected_revision=9 actual_revision=10',
          ),
        )
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-read-current-revision',
          result: {
            protocol_version: 'v1',
            revision: 10,
          },
        })
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-submit-signed-transaction',
          result: {
            protocol_version: 'v1',
            revision: 11,
            committed_event_ids: ['evt-submit-execution-1'],
            execution_result: createTerminalExecutionResult({
              status: 'confirmed',
              transactionHash:
                '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            }),
          },
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
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000b1',
        signedPayload: {
          signature: TEST_TRANSACTION_SIGNATURE,
          recoveryId: 1,
        },
      })),
    );
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      runtimeSignerRef: 'service-wallet',
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
        name: 'request_transaction_execution',
      },
    });

    expect(runtimeSigning.signPayload).toHaveBeenCalledTimes(1);
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-transaction-execution',
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1',
        expected_revision: 7,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-read-current-revision',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'ember-lending',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(3, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-transaction-execution',
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1',
        expected_revision: 8,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(4, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-submit-signed-transaction',
      method: 'subagent.submitSignedTransaction.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1:submit-transaction:req-ember-lending-execution-001',
        expected_revision: 9,
        transaction_plan_id: 'txplan-ember-lending-001',
        signed_transaction: expect.objectContaining({
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
          unsigned_transaction_hex: TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX,
          signer_address: '0x00000000000000000000000000000000000000b1',
          raw_transaction: expect.stringMatching(/^0x[0-9a-f]+$/),
        }),
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(5, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-read-current-revision',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'ember-lending',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(6, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-submit-signed-transaction',
      method: 'subagent.submitSignedTransaction.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1:submit-transaction:req-ember-lending-execution-001',
        expected_revision: 10,
        transaction_plan_id: 'txplan-ember-lending-001',
        signed_transaction: expect.objectContaining({
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'txpayload-ember-lending-001',
          unsigned_transaction_hex: TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX,
          signer_address: '0x00000000000000000000000000000000000000b1',
          raw_transaction: expect.stringMatching(/^0x[0-9a-f]+$/),
        }),
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 11,
        lastExecutionTxHash:
          '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Lending transaction execution confirmed through Shared Ember.',
        },
      },
    });
  });

  it('returns a failed execution result when signed-artifact submission hits a local transport error', async () => {
    const protocolHost = {
      handleJsonRpc: vi
        .fn()
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
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:4010')),
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
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000b1',
        signedPayload: {
          signature: TEST_TRANSACTION_SIGNATURE,
          recoveryId: 1,
        },
      })),
    );
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      runtimeSignerRef: 'service-wallet',
      agentId: 'ember-lending',
    });

    await expect(
      domain.handleOperation?.({
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
          name: 'request_transaction_execution',
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 9,
        lastExecutionResult: null,
        lastExecutionTxHash: null,
        pendingExecutionSubmission: {
          transactionPlanId: 'txplan-ember-lending-001',
          requestId: 'req-ember-lending-execution-001',
          idempotencyKey: 'idem-execute-transaction-plan-thread-1',
        },
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage: 'connect ECONNREFUSED 127.0.0.1:4010',
        },
      },
    });
  });

  it('recovers a dropped submit response from the committed-event outbox without signing again', async () => {
    const protocolHost = {
      handleJsonRpc: vi
        .fn()
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
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:4010')),
      readCommittedEventOutbox: vi
        .fn()
        .mockResolvedValueOnce({
          protocol_version: 'v1',
          revision: 10,
          events: [
            {
              event_id: 'evt-request-execution-3',
              sequence: 3,
              aggregate: 'request',
              aggregate_id: 'req-ember-lending-execution-001',
              event_type: 'requestExecution.completed.v1',
              committed_at: '2026-04-01T06:18:00Z',
              payload: {
                request_id: 'req-ember-lending-execution-001',
                transaction_plan_id: 'txplan-ember-lending-001',
                execution_id: 'exec-ember-lending-001',
                status: 'confirmed',
                transaction_hash:
                  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
              },
            },
          ],
        }),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 10,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async () => ({
        confirmedAddress: '0x00000000000000000000000000000000000000b1',
        signedPayload: {
          signature: TEST_TRANSACTION_SIGNATURE,
          recoveryId: 1,
        },
      })),
    );
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      runtimeSignerRef: 'service-wallet',
      agentId: 'ember-lending',
    });
    const initialState = {
      ...createManagedLifecycleState(),
      lastCandidatePlan: {
        transaction_plan_id: 'txplan-ember-lending-001',
      },
      lastCandidatePlanSummary: 'supply reserved USDC on Aave',
    };

    const firstAttempt = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: initialState,
      operation: {
        source: 'tool',
        name: 'request_transaction_execution',
      },
    });

    const resumedAttempt = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: firstAttempt?.state,
      operation: {
        source: 'tool',
        name: 'request_transaction_execution',
      },
    });

    expect(runtimeSigning.signPayload).toHaveBeenCalledTimes(1);
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledTimes(2);
    expect(protocolHost.readCommittedEventOutbox).toHaveBeenNthCalledWith(1, {
      protocol_version: 'v1',
      consumer_id: 'ember-lending-req-ember-lending-execution-001',
      after_sequence: 0,
      limit: 100,
    });
    expect(resumedAttempt).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 10,
        lastExecutionResult: {
          phase: 'completed',
          request_id: 'req-ember-lending-execution-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          execution: {
            execution_id: 'exec-ember-lending-001',
            status: 'confirmed',
            transaction_hash:
              '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          },
        },
        lastExecutionTxHash:
          '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        pendingExecutionSubmission: null,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Lending transaction execution confirmed through Shared Ember.',
        },
      },
    });
  });

  it('surfaces blocked execution requests without claiming the transaction plan executed', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-request-transaction-execution',
        result: {
          protocol_version: 'v1',
          revision: 9,
          committed_event_ids: ['evt-request-execution-blocked-1'],
          execution_result: createBlockedPreparationResult({
            result: 'needs_release_or_transfer',
            requestId: 'req-ember-lending-blocked-001',
            message: 'reserved capital is still claimed by another agent',
            blockingReasonCode: 'reserved_for_other_agent',
            nextAction: 'escalate_to_control_plane',
          }),
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
        name: 'request_transaction_execution',
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        mandateRef: 'mandate-ember-lending-001',
        walletAddress: '0x00000000000000000000000000000000000000b1',
        rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
        lastSharedEmberRevision: 9,
        lastExecutionTxHash: null,
        lastReservationSummary:
          'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
        lastExecutionResult: {
          phase: 'blocked',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-blocked-001',
          request_result: {
            result: 'needs_release_or_transfer',
          },
        },
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Lending transaction execution request was blocked by Shared Ember: reserved capital is still claimed by another agent.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-execution-result',
              revision: 9,
              outcome: 'blocked',
              message:
                'Lending transaction execution request was blocked by Shared Ember: reserved capital is still claimed by another agent.',
            },
          },
        ],
      },
    });
  });

  it('surfaces denied execution requests with the denied admission reason', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-request-transaction-execution',
        result: {
          protocol_version: 'v1',
          revision: 9,
          committed_event_ids: ['evt-request-execution-denied-1'],
          execution_result: createBlockedPreparationResult({
            result: 'denied',
            requestId: 'req-ember-lending-denied-001',
            message: 'risk policy denied the requested lending path',
            blockingReasonCode: 'policy_denied',
            nextAction: 'stop',
          }),
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
        name: 'request_transaction_execution',
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 9,
        lastExecutionTxHash: null,
        lastExecutionResult: {
          phase: 'blocked',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-denied-001',
          request_result: {
            result: 'denied',
          },
        },
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Lending transaction execution request was denied by Shared Ember: risk policy denied the requested lending path.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-execution-result',
              revision: 9,
              outcome: 'denied',
              message:
                'Lending transaction execution request was denied by Shared Ember: risk policy denied the requested lending path.',
            },
          },
        ],
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
      },
    });
  });

  it('fails escalation when lean runtime state omits authoritative handoff fields', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: string };
        if (request.method === 'subagent.createEscalationRequest.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-create-escalation-request',
            result: {
              protocol_version: 'v1',
              revision: 10,
              escalation_request: {
                source: 'subagent_loop',
                request_kind: 'release_or_transfer_request',
                request_id: 'req-ember-lending-escalation-lean-001',
                handoff_id: 'handoff-ember-lending-escalation-001',
              },
            },
          };
        }

        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
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
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        ...createManagedLifecycleState(),
        mandateRef: null,
        mandateSummary: null,
        mandateContext: {
          network: 'arbitrum',
          protocol: 'lending',
        },
        walletAddress: null,
        rootUserWalletAddress: null,
        rootedWalletContextId: null,
        lastPortfolioState: {
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
      operation: {
        source: 'tool',
        name: 'create_escalation_request',
        input: createEscalationRequestInput(),
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        mandateRef: null,
        walletAddress: null,
        rootUserWalletAddress: null,
        rootedWalletContextId: null,
        lastEscalationSummary: null,
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Lending runtime context is incomplete. Wait for execution-context hydration before escalating.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.readOnboardingState.v1',
      }),
    );
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.createEscalationRequest.v1',
      }),
    );
  });

  it('fails candidate-plan materialization when the subagent wallet matches the rooted user wallet', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => {
        throw new Error('materialize should not be attempted with an invalid handoff');
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
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        ...createManagedLifecycleState(),
        walletAddress: '0x00000000000000000000000000000000000000a1',
        rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
      },
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: createCandidatePlanInput(),
      },
    });

    expect(result).toMatchObject({
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Lending runtime context is incomplete. Wait for execution-context hydration before planning.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.createTransactionPlan.v1',
      }),
    );
  });
});
