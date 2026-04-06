import { describe, expect, it, vi } from 'vitest';

import {
  createEmberLendingDomain,
  EMBER_LENDING_INTERNAL_HYDRATE_COMMAND,
  hasConnectReadyEmberLendingRuntimeProjection,
} from './sharedEmberAdapter.js';

function createRuntimeSigningStub(
  signPayload: ReturnType<typeof vi.fn>,
) {
  return {
    readAddress: vi.fn(),
    signPayload,
  };
}

function createAnchoredPayloadResolverStub() {
  return {
    anchorCandidatePlanPayload: vi.fn(async () => ({
      anchoredPayloadRef: 'txpayload-ember-lending-001',
      transactionRequests: [
        {
          type: 'EVM_TX',
          to: '0x00000000000000000000000000000000000000d1',
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
    resolvePreparedUnsignedTransaction: vi.fn(async () => TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX),
  };
}

const TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX =
  '0x02e982a4b1018405f5e100843b9aca008252089400000000000000000000000000000000000000c18080c0';
const TEST_TRANSACTION_SIGNATURE =
  '0x464a27f0b9166323a2d686a053ac34e74c318b59854dcc7de4221837437214870c365e2d8e5060f092656d3bd06f78c324ed296792df9c60f76c68bca5551eb601';
const DEFAULT_THIN_PLAN_HANDOFF_ID = 'handoff-thread-1-98aa3116f63d';
const DEFAULT_THIN_PLAN_IDEMPOTENCY_KEY = 'idem-create-transaction-plan-thread-1-7417b3f58629';
const DEFAULT_RICH_PLAN_HANDOFF_ID = 'handoff-thread-1-05c10d6a10a6';
const DEFAULT_EXECUTION_IDEMPOTENCY_KEY =
  'idem-execute-transaction-plan-thread-1-07b74ae67cd9';

function createAnchoredPayloadRecord() {
  return {
    anchoredPayloadRef: 'txpayload-ember-lending-001',
    transactionRequests: [
      {
        type: 'EVM_TX' as const,
        to: '0x00000000000000000000000000000000000000d1',
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
          purpose: 'deploy',
          control_path: 'lending.supply',
        },
      ],
    },
    lastSharedEmberRevision: 7,
    lastReservationSummary: 'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
    lastCandidatePlan: null,
    lastCandidatePlanSummary: null,
    anchoredPayloadRecords: [],
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

function createPortfolioStateResponseWithoutRootedWalletContext() {
  return {
    jsonrpc: '2.0',
    id: 'shared-ember-thread-1-read-portfolio-state',
    result: {
      protocol_version: 'v1',
      revision: 7,
      portfolio_state: {
        agent_id: 'ember-lending',
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
            status: 'deployed',
            control_path: 'lending.supply',
            position_kind: 'loan',
            protocol_family: 'aave',
            protocol_position_ref: 'aave-supplied-usdc-001',
            benchmark_value_usd: '90.00',
          },
        ],
        reservations: [
          {
            reservation_id: 'res-ember-lending-withdraw-001',
            control_path: 'lending.withdraw',
            purpose: 'refresh withdraw coverage',
            unit_allocations: [
              {
                unit_id: 'unit-unreserved-001',
                quantity: '90',
              },
            ],
          },
          {
            reservation_id: 'res-ember-lending-borrow-001',
            control_path: 'lending.borrow',
            purpose: 'refresh borrow coverage',
            unit_allocations: [
              {
                unit_id: 'unit-unreserved-001',
                quantity: '90',
              },
            ],
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

function createThinCandidatePlanInput() {
  return {
    network: 'arbitrum',
    asset: 'USDC',
    protocol: 'aave',
    amount: '10',
    risk_profile: 'medium',
    constraints: ['health factor >= 1.25'],
    wallet_address: '0x00000000000000000000000000000000000000b1',
    root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
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
  inlineUnsignedTransactionHex?: `0x${string}` | null;
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
      ...(input?.inlineUnsignedTransactionHex === undefined
        ? {
            unsigned_transaction_hex: TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX,
          }
        : input.inlineUnsignedTransactionHex
          ? {
              unsigned_transaction_hex: input.inlineUnsignedTransactionHex,
            }
          : {}),
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
      canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
      active_delegation_id: 'del-ember-lending-001',
      root_delegation_id: 'root-user-ember-lending-001',
      prepared_at: '2026-04-01T06:15:00.000Z',
      metadata: {
        planned_transaction_payload_ref: 'txpayload-ember-lending-001',
      },
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
      canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
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
  message?: string;
}) {
  return {
    phase: 'completed',
    transaction_plan_id: 'txplan-ember-lending-001',
    request_id: 'req-ember-lending-execution-001',
    execution: {
      execution_id: 'exec-ember-lending-001',
      status: input.status,
      ...(input.message ? { message: input.message } : {}),
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

  it('tells the model to compute concrete requested quantities for partial managed actions', () => {
    const domain = createEmberLendingDomain({
      agentId: 'ember-lending',
    });

    const createTransactionPlan = domain.lifecycle.commands.find(
      (command) => command.name === 'create_transaction_plan',
    );

    expect(createTransactionPlan?.description).toContain('requested_quantities');
    expect(createTransactionPlan?.description).toContain('partial increases or decreases');
    expect(createTransactionPlan?.description).toContain('base-unit');
    expect(createTransactionPlan?.description).toContain('full or max-possible amount');
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

  it('does not treat a partial managed projection without rooted wallet context as connect-ready', () => {
    expect(
      hasConnectReadyEmberLendingRuntimeProjection({
        mandateRef: 'mandate-ember-lending-001',
        walletAddress: '0x00000000000000000000000000000000000000b1',
        rootUserWalletAddress: '0x00000000000000000000000000000000000000a1',
        rootedWalletContextId: null,
        lastPortfolioState: {
          agent_id: 'ember-lending',
          owned_units: [],
          reservations: [],
        },
      }),
    ).toBe(false);
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
        '      <status>deployed</status>',
        '      <control_path>lending.supply</control_path>',
        '      <position_kind>loan</position_kind>',
        '      <protocol_family>aave</protocol_family>',
        '      <protocol_position_ref>aave-supplied-usdc-001</protocol_position_ref>',
        '      <benchmark_value_usd>90.00</benchmark_value_usd>',
        '  <active_reservations>',
        '      <control_path>lending.withdraw</control_path>',
        '      <control_path>lending.borrow</control_path>',
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
        '      <status>deployed</status>',
        '      <control_path>lending.supply</control_path>',
        '      <position_kind>loan</position_kind>',
        '      <protocol_family>aave</protocol_family>',
        '      <protocol_position_ref>aave-supplied-usdc-001</protocol_position_ref>',
        '  <active_reservations>',
        '      <control_path>lending.withdraw</control_path>',
        '      <control_path>lending.borrow</control_path>',
        '      <benchmark_value_usd>100.00</benchmark_value_usd>',
      ]),
    );
    expect(context?.join('\n')).not.toContain('shared_ember_accounting_context');
    expect(context?.join('\n')).not.toContain('<proofs>');
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
        if (request.method === 'subagent.readPortfolioState.v1') {
          return createLeanPortfolioStateResponse();
        }

        if (request.method === 'subagent.readExecutionContext.v1') {
          return createEmptyExecutionContextResponse();
        }

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
            'Portfolio Manager onboarding must complete before lending can plan transactions for this thread.',
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

  it('rehydrates from Shared Ember before planning when the cached lending state is partial', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: unknown };

        if (request.method === 'subagent.readPortfolioState.v1') {
          return createPortfolioStateResponse();
        }

        if (request.method === 'subagent.readExecutionContext.v1') {
          return createExecutionContextResponse();
        }

        if (request.method === 'subagent.createTransactionPlan.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-materialize-candidate-plan',
            result: {
              protocol_version: 'v1',
              revision: 12,
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
        }

        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 12,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 12,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const anchoredPayloadResolver = createAnchoredPayloadResolverStub();
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
      anchoredPayloadResolver,
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        ...createManagedLifecycleState(),
        rootedWalletContextId: null,
        lastPortfolioState: {
          agent_id: 'ember-lending',
          owned_units: [],
          reservations: [],
        },
        lastReservationSummary: null,
      },
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: createThinCandidatePlanInput(),
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        rootedWalletContextId: 'rwc-ember-lending-thread-001',
        lastSharedEmberRevision: 12,
        lastCandidatePlanSummary: 'supply reserved USDC on Aave',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Candidate lending plan created through the Shared Ember planner.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-create-transaction-plan',
        method: 'subagent.createTransactionPlan.v1',
        params: expect.objectContaining({
          idempotency_key: DEFAULT_THIN_PLAN_IDEMPOTENCY_KEY,
          expected_revision: 11,
          handoff: expect.objectContaining({
            agent_id: 'ember-lending',
            root_user_wallet: '0x00000000000000000000000000000000000000a1',
            mandate_ref: 'mandate-ember-lending-001',
            candidate_unit_ids: ['unit-ember-lending-001'],
            requested_quantities: [
              {
                unit_id: 'unit-ember-lending-001',
                quantity: '10',
              },
            ],
          }),
        }),
      }),
    );
  });

  it('creates a candidate plan when PM has admitted reserved units but rooted wallet context has not projected yet', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: unknown };

        if (request.method === 'subagent.readPortfolioState.v1') {
          return createPortfolioStateResponseWithoutRootedWalletContext();
        }

        if (request.method === 'subagent.readExecutionContext.v1') {
          return createExecutionContextResponse();
        }

        if (request.method === 'subagent.createTransactionPlan.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-materialize-candidate-plan',
            result: {
              protocol_version: 'v1',
              revision: 12,
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
        }

        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 12,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 12,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const anchoredPayloadResolver = createAnchoredPayloadResolverStub();
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
      anchoredPayloadResolver,
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        ...createManagedLifecycleState(),
        rootedWalletContextId: null,
      },
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: createThinCandidatePlanInput(),
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        rootedWalletContextId: null,
        lastSharedEmberRevision: 12,
        lastCandidatePlanSummary: 'supply reserved USDC on Aave',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Candidate lending plan created through the Shared Ember planner.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-create-transaction-plan',
        method: 'subagent.createTransactionPlan.v1',
        params: expect.objectContaining({
          idempotency_key: DEFAULT_THIN_PLAN_IDEMPOTENCY_KEY,
          expected_revision: 7,
          handoff: expect.objectContaining({
            agent_id: 'ember-lending',
            root_user_wallet: '0x00000000000000000000000000000000000000a1',
            mandate_ref: 'mandate-ember-lending-001',
            candidate_unit_ids: ['unit-ember-lending-001'],
            requested_quantities: [
              {
                unit_id: 'unit-ember-lending-001',
                quantity: '10',
              },
            ],
          }),
        }),
      }),
    );
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.readOnboardingState.v1',
      }),
    );
  });

  it('preserves partial requested quantities when the model passes the object-map command shape', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: unknown };

        if (request.method === 'subagent.createTransactionPlan.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-materialize-candidate-plan',
            result: {
              protocol_version: 'v1',
              revision: 12,
              committed_event_ids: ['evt-candidate-plan-1'],
              candidate_plan: {
                planning_kind: 'subagent_handoff',
                transaction_plan_id: 'txplan-ember-lending-001',
                handoff: {
                  handoff_id: 'handoff-thread-1',
                  payload_builder_output: {
                    transaction_payload_ref: 'txpayload-ember-lending-001',
                    required_control_path: 'lending.withdraw',
                    network: 'arbitrum',
                  },
                },
                compact_plan_summary: {
                  control_path: 'lending.withdraw',
                  asset: 'USDC',
                  amount: '5',
                  summary: 'withdraw half of the current USDC collateral from Aave',
                },
              },
            },
          };
        }

        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 12,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 12,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const anchoredPayloadResolver = createAnchoredPayloadResolverStub();
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
      anchoredPayloadResolver,
    });

    await domain.handleOperation?.({
      threadId: 'thread-1',
      state: createManagedLifecycleState(),
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: {
          action_summary: 'withdraw half of the current USDC collateral from Aave',
          intent: 'withdraw',
          candidate_unit_ids: ['unit-ember-lending-001'],
          requested_quantities: {
            'unit-ember-lending-001': '5',
          },
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.createTransactionPlan.v1',
        params: expect.objectContaining({
          handoff: expect.objectContaining({
            candidate_unit_ids: ['unit-ember-lending-001'],
            requested_quantities: [
              {
                unit_id: 'unit-ember-lending-001',
                quantity: '5',
              },
            ],
          }),
        }),
      }),
    );
  });

  it('fails closed when Shared Ember rejects candidate plan creation', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: unknown };

        if (request.method === 'subagent.createTransactionPlan.v1') {
          throw new Error(
            'Shared Ember Domain Service JSON-RPC error: protocol_internal_error: missing owned unit unit-ember-lending-001 for runtime handoff plan',
          );
        }

        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 12,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 12,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
      anchoredPayloadResolver: createAnchoredPayloadResolverStub(),
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: createManagedLifecycleState(),
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: createThinCandidatePlanInput(),
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastCandidatePlan: null,
        lastCandidatePlanSummary: null,
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Shared Ember Domain Service JSON-RPC error: protocol_internal_error: missing owned unit unit-ember-lending-001 for runtime handoff plan',
        },
      },
    });
  });

  it('uses distinct default plan identities for different plan requests on the same thread', async () => {
    const createPlanRequests: Array<{ params?: Record<string, unknown> }> = [];
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: string; params?: Record<string, unknown> };

        if (request.method === 'subagent.createTransactionPlan.v1') {
          createPlanRequests.push(request);
          const handoff = request.params?.['handoff'] as Record<string, unknown>;
          const handoffId = String(handoff['handoff_id']);
          const payloadRef = `txpayload-${handoffId}`;
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-materialize-candidate-plan',
            result: {
              protocol_version: 'v1',
              revision: 12 + createPlanRequests.length,
              committed_event_ids: [`evt-candidate-plan-${createPlanRequests.length}`],
              candidate_plan: {
                planning_kind: 'subagent_handoff',
                transaction_plan_id: `txplan-${handoffId}`,
                handoff: {
                  handoff_id: handoffId,
                  payload_builder_output: {
                    transaction_payload_ref: payloadRef,
                    required_control_path: 'lending.withdraw',
                    network: 'arbitrum',
                  },
                },
                compact_plan_summary: {
                  control_path: 'lending.withdraw',
                  asset: 'USDC',
                  amount: String((handoff['requested_quantities'] as Array<{ quantity: string }>)[0]?.quantity),
                  summary: String(handoff['action_summary']),
                },
              },
            },
          };
        }

        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 14,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 14,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const anchoredPayloadResolver = {
      anchorCandidatePlanPayload: vi.fn(async (input: {
        transactionPlanId: string;
        payloadBuilderOutput: { required_control_path: string; network: string };
      }) => ({
        anchoredPayloadRef: `anchored-${input.transactionPlanId}`,
        transactionRequests: [
          {
            type: 'EVM_TX' as const,
            to: '0x00000000000000000000000000000000000000d1',
            value: '0',
            data: '0x095ea7b3',
            chainId: '42161',
          },
        ],
        controlPath: input.payloadBuilderOutput.required_control_path,
        network: input.payloadBuilderOutput.network,
        transactionPlanId: input.transactionPlanId,
      })),
      resolvePreparedUnsignedTransaction: vi.fn(async () => TEST_UNSIGNED_EXECUTION_TRANSACTION_HEX),
    };
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
      anchoredPayloadResolver,
    });

    const firstResult = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: createManagedLifecycleState(),
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: createThinCandidatePlanInput(),
      },
    });

    const secondResult = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: firstResult?.state ?? createManagedLifecycleState(),
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: {
          intent: 'decrease',
          action_summary: 'withdraw reserved 5 USDC on Aave',
          requested_quantities: [
            {
              unit_id: 'unit-ember-lending-001',
              quantity: '5',
            },
          ],
        },
      },
    });

    expect(firstResult).toMatchObject({
      outputs: {
        status: {
          executionStatus: 'completed',
        },
      },
    });
    expect(secondResult).toMatchObject({
      outputs: {
        status: {
          executionStatus: 'completed',
        },
      },
    });

    expect(createPlanRequests).toHaveLength(2);
    expect(createPlanRequests[0]?.params?.['idempotency_key']).not.toBe(
      createPlanRequests[1]?.params?.['idempotency_key'],
    );
    expect(
      (createPlanRequests[0]?.params?.['handoff'] as Record<string, unknown>)['handoff_id'],
    ).not.toBe(
      (createPlanRequests[1]?.params?.['handoff'] as Record<string, unknown>)['handoff_id'],
    );
    expect(firstResult?.state.lastCandidatePlan).not.toEqual(secondResult?.state.lastCandidatePlan);
  });

  it('defaults follow-up planning to decrease when withdraw coverage is active and no explicit intent is provided', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: string; params?: Record<string, unknown> };

        if (request.method === 'subagent.createTransactionPlan.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-materialize-candidate-plan',
            result: {
              protocol_version: 'v1',
              revision: 13,
              committed_event_ids: ['evt-candidate-plan-2'],
              candidate_plan: {
                planning_kind: 'subagent_handoff',
                transaction_plan_id: 'txplan-ember-lending-withdraw-001',
                handoff: {
                  handoff_id: String((request.params?.['handoff'] as Record<string, unknown>)['handoff_id']),
                  payload_builder_output: {
                    transaction_payload_ref: 'txpayload-ember-lending-withdraw-001',
                    required_control_path: 'lending.withdraw',
                    network: 'arbitrum',
                  },
                },
                compact_plan_summary: {
                  control_path: 'lending.withdraw',
                  asset: 'USDC',
                  amount: '10',
                  summary: 'withdraw reserved 10 USDC on Aave',
                },
              },
            },
          };
        }

        throw new Error(`Unexpected Shared Ember JSON-RPC method: ${String(request.method)}`);
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 13,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 13,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
      anchoredPayloadResolver: createAnchoredPayloadResolverStub(),
    });

    await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        ...createManagedLifecycleState(),
        lastPortfolioState: {
          agent_id: 'ember-lending',
          owned_units: [
            {
              unit_id: 'unit-ember-lending-001',
              root_asset: 'USDC',
              quantity: '10',
              status: 'deployed',
              control_path: 'lending.supply',
              position_kind: 'loan',
            },
          ],
          reservations: [
            {
              reservation_id: 'reservation-ember-lending-withdraw-001',
              purpose: 'refresh withdraw coverage',
              control_path: 'lending.withdraw',
              unit_allocations: [
                {
                  unit_id: 'unit-ember-lending-001',
                  quantity: '10',
                },
              ],
            },
            {
              reservation_id: 'reservation-ember-lending-borrow-001',
              purpose: 'refresh borrow coverage',
              control_path: 'lending.borrow',
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
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: {},
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.createTransactionPlan.v1',
        params: expect.objectContaining({
          handoff: expect.objectContaining({
            intent: 'decrease',
          }),
        }),
      }),
    );
  });

  it('explains when PM onboarding is still ingested because the mandate asset was not admitted', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: string };

        if (request.method === 'subagent.readPortfolioState.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-portfolio-state',
            result: {
              protocol_version: 'v1',
              revision: 8,
              portfolio_state: {
                agent_id: 'ember-lending',
                owned_units: [],
                reservations: [],
              },
            },
          };
        }

        if (request.method === 'subagent.readExecutionContext.v1') {
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
                  'lend WETH on Aave within medium-risk allocation and health-factor guardrails',
                mandate_context: {
                  network: 'arbitrum',
                  protocol: 'aave',
                  allowedCollateralAssets: ['WETH'],
                  allowedBorrowAssets: ['WETH'],
                  maxAllocationPct: 35,
                  maxLtvBps: 7000,
                  minHealthFactor: '1.25',
                },
                subagent_wallet_address: '0x00000000000000000000000000000000000000b1',
                root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
                owned_units: [],
                wallet_contents: [
                  {
                    asset: 'ETH',
                    amount: '1.5',
                    benchmark_value_usd: '3000',
                  },
                  {
                    asset: 'USDC',
                    amount: '10',
                    benchmark_value_usd: '10',
                  },
                ],
              },
            },
          };
        }

        if (request.method === 'orchestrator.readOnboardingState.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-onboarding-state',
            result: {
              protocol_version: 'v1',
              revision: 11,
              onboarding_state: {
                wallet_address: '0x00000000000000000000000000000000000000a1',
                network: 'arbitrum',
                phase: 'ingested',
                proofs: {
                  rooted_wallet_context_registered: true,
                  root_delegation_registered: true,
                  root_authority_active: true,
                  wallet_baseline_observed: true,
                  accounting_units_seeded: true,
                  mandate_inputs_configured: true,
                  reserve_policy_configured: false,
                  capital_reserved_for_agent: false,
                  policy_snapshot_recorded: false,
                  initial_subagent_delegation_issued: false,
                  agent_active: false,
                },
                owned_units: [
                  {
                    unit_id: 'unit-eth-thread-001',
                    root_asset: 'ETH',
                  },
                  {
                    unit_id: 'unit-usdc-thread-001',
                    root_asset: 'USDC',
                  },
                ],
                reservations: [],
              },
            },
          };
        }

        throw new Error(`unexpected method ${request.method}`);
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 0,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 0,
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
        mandateSummary: 'lend WETH on Aave within medium-risk allocation and health-factor guardrails',
        mandateContext: {
          network: 'arbitrum',
          protocol: 'aave',
          allowedCollateralAssets: ['WETH'],
          allowedBorrowAssets: ['WETH'],
          maxAllocationPct: 35,
          maxLtvBps: 7000,
          minHealthFactor: '1.25',
        },
        rootedWalletContextId: null,
        lastPortfolioState: {
          agent_id: 'ember-lending',
          owned_units: [],
          reservations: [],
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
        rootedWalletContextId: null,
        lastCandidatePlanSummary: null,
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Portfolio Manager onboarding is not complete for this thread because Shared Ember could not admit any WETH for lending. Wallet accounting currently shows ETH, USDC.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'orchestrator.readOnboardingState.v1',
        params: {
          agent_id: 'ember-lending',
          wallet_address: '0x00000000000000000000000000000000000000a1',
          network: 'arbitrum',
        },
      }),
    );
    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.createTransactionPlan.v1',
      }),
    );
  });

  it('fails closed when planning references units that Portfolio Manager has not admitted', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: unknown };

        switch (request.method) {
          case 'subagent.readPortfolioState.v1':
            return createPortfolioStateResponse();
          case 'subagent.readExecutionContext.v1':
            return createExecutionContextResponse();
          default:
            throw new Error(`Unexpected JSON-RPC method: ${String(request.method)}`);
        }
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

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: createManagedLifecycleState(),
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: {
          ...createCandidatePlanInput(),
          candidate_unit_ids: ['unit-not-admitted'],
          requested_quantities: [
            {
              unit_id: 'unit-not-admitted',
              quantity: '10',
            },
          ],
        },
      },
    });

    expect(result).toMatchObject({
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Lending can only plan with Portfolio Manager-admitted units for this thread.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'subagent.createTransactionPlan.v1',
      }),
    );
  });

  it('fails candidate-plan creation when Shared Ember omits planner metadata required for service-owned anchoring', async () => {
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
        lastCandidatePlan: null,
        anchoredPayloadRecords: [],
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Candidate lending plan could not be anchored behind the lending service boundary because Shared Ember omitted the planner payload metadata required for anchoring.',
        },
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
          handoff_id: DEFAULT_RICH_PLAN_HANDOFF_ID,
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

  it('anchors the planner-returned payload ref behind the lending service boundary during candidate-plan creation', async () => {
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
    const anchoredPayloadResolver = createAnchoredPayloadResolverStub();
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
      anchoredPayloadResolver,
    });

    await domain.handleOperation?.({
      threadId: 'thread-1',
      state: createManagedLifecycleState(),
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: createCandidatePlanInput(),
      },
    });

    expect(anchoredPayloadResolver.anchorCandidatePlanPayload).toHaveBeenCalledWith({
      agentId: 'ember-lending',
      threadId: 'thread-1',
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
  });

  it('materializes candidate plans when model input omits required handoff fields but managed state is hydrated', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-materialize-thin-candidate-plan',
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
    const anchoredPayloadResolver = createAnchoredPayloadResolverStub();
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
      anchoredPayloadResolver,
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: createManagedLifecycleState(),
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: createThinCandidatePlanInput(),
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
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-create-transaction-plan',
      method: 'subagent.createTransactionPlan.v1',
      params: {
        idempotency_key: DEFAULT_THIN_PLAN_IDEMPOTENCY_KEY,
        expected_revision: 7,
        handoff: {
          handoff_id: DEFAULT_THIN_PLAN_HANDOFF_ID,
          agent_id: 'ember-lending',
          root_user_wallet: '0x00000000000000000000000000000000000000a1',
          mandate_ref: 'mandate-ember-lending-001',
          intent: 'deploy',
          action_summary: 'supply reserved 10 USDC on Aave',
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
              'Reservation reservation-ember-lending-001 deploys 10 USDC via lending.supply.',
            why_this_path_is_best:
              'This matches the current lending mandate and reserved control path.',
            consequence_if_delayed: 'Reserved capital remains idle.',
            alternatives_considered: ['wait and keep the capital idle'],
          },
        },
      },
    });

    expect(anchoredPayloadResolver.anchorCandidatePlanPayload).toHaveBeenCalledWith({
      agentId: 'ember-lending',
      threadId: 'thread-1',
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
  });

  it('normalizes partial persisted managed state before anchoring a candidate plan', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-materialize-partial-state-candidate-plan',
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
    const anchoredPayloadResolver = createAnchoredPayloadResolverStub();
    const domain = createEmberLendingDomain({
      protocolHost,
      agentId: 'ember-lending',
      anchoredPayloadResolver,
    });

    const partialPersistedState = {
      ...createManagedLifecycleState(),
      anchoredPayloadRecords: undefined,
    };

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: partialPersistedState as unknown as EmberLendingLifecycleState,
      operation: {
        source: 'tool',
        name: 'create_transaction_plan',
        input: createThinCandidatePlanInput(),
      },
    });

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 8,
        lastCandidatePlanSummary: 'supply reserved USDC on Aave',
        anchoredPayloadRecords: [expect.objectContaining({ anchoredPayloadRef: expect.any(String) })],
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Candidate lending plan created through the Shared Ember planner.',
        },
      },
    });
  });

  it('fails candidate-plan creation when the anchored payload resolver is unavailable', async () => {
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
        lastCandidatePlan: null,
        anchoredPayloadRecords: [],
      },
      outputs: {
        status: {
          executionStatus: 'failed',
          statusMessage:
            'Candidate lending plan could not be anchored behind the lending service boundary because the anchored payload resolver is unavailable.',
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
          execution_result: createReadyForExecutionSigningPreparationResult({
            inlineUnsignedTransactionHex: null,
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
        anchoredPayloadRecords: [createAnchoredPayloadRecord()],
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
          statusMessage:
            'Runtime-owned signing service is not configured for lending transaction execution.',
        },
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-transaction-execution',
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: DEFAULT_EXECUTION_IDEMPOTENCY_KEY,
        expected_revision: 7,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
  });

  it('fails execution when Shared Ember omits inline unsigned transaction data and the concrete service layer does not resolve it', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-request-transaction-execution',
        result: {
          protocol_version: 'v1',
          revision: 9,
          committed_event_ids: ['evt-prepare-execution-1'],
          execution_result: createReadyForExecutionSigningPreparationResult({
            inlineUnsignedTransactionHex: null,
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
        anchoredPayloadRecords: [createAnchoredPayloadRecord()],
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
          statusMessage:
            'Lending execution signing could not continue because the concrete service integration layer did not resolve the prepared unsigned transaction.',
        },
      },
    });
    expect(runtimeSigning.signPayload).not.toHaveBeenCalled();
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
          execution_result: createReadyForExecutionSigningPreparationResult({
            inlineUnsignedTransactionHex: null,
          }),
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
    const anchoredPayloadResolver = createAnchoredPayloadResolverStub();
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      anchoredPayloadResolver,
      runtimeSignerRef: 'service-wallet',
      agentId: 'ember-lending',
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        ...createManagedLifecycleState(),
        anchoredPayloadRecords: [createAnchoredPayloadRecord()],
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
      anchoredPayloadRecords: [createAnchoredPayloadRecord()],
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-transaction-execution',
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: DEFAULT_EXECUTION_IDEMPOTENCY_KEY,
        expected_revision: 7,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-submit-signed-transaction',
      method: 'subagent.submitSignedTransaction.v1',
      params: {
        idempotency_key: `${DEFAULT_EXECUTION_IDEMPOTENCY_KEY}:submit-transaction:req-ember-lending-execution-001`,
        expected_revision: 9,
        transaction_plan_id: 'txplan-ember-lending-001',
        signed_transaction: expect.objectContaining({
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
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

  it('normalizes a non-prefixed runtime signature before submitting the signed transaction', async () => {
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
            execution_result: createReadyForExecutionSigningPreparationResult({
              inlineUnsignedTransactionHex: null,
            }),
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
          signature: TEST_TRANSACTION_SIGNATURE.slice(2),
          recoveryId: 1,
        },
      })),
    );
    const anchoredPayloadResolver = createAnchoredPayloadResolverStub();
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      anchoredPayloadResolver,
      runtimeSignerRef: 'service-wallet',
      agentId: 'ember-lending',
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        ...createManagedLifecycleState(),
        anchoredPayloadRecords: [createAnchoredPayloadRecord()],
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

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-submit-signed-transaction',
      method: 'subagent.submitSignedTransaction.v1',
      params: expect.objectContaining({
        signed_transaction: expect.objectContaining({
          signer_address: '0x00000000000000000000000000000000000000b1',
          raw_transaction: expect.stringMatching(/^0x[0-9a-f]+$/),
        }),
      }),
    });
    expect(result).toMatchObject({
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Lending transaction execution confirmed through Shared Ember.',
        },
      },
    });
  });

  it('surfaces anchored payload resolution failures as local execution failures', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-request-transaction-execution',
        result: {
          protocol_version: 'v1',
          revision: 9,
          committed_event_ids: ['evt-prepare-execution-1'],
          execution_result: createReadyForExecutionSigningPreparationResult({
            inlineUnsignedTransactionHex: null,
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
    const anchoredPayloadResolver = createAnchoredPayloadResolverStub();
    anchoredPayloadResolver.resolvePreparedUnsignedTransaction.mockRejectedValueOnce(
      new Error(
        'Anchored payload ref "txpayload-ember-lending-001" does not contain transaction step 3.',
      ),
    );
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      anchoredPayloadResolver,
      runtimeSignerRef: 'service-wallet',
      agentId: 'ember-lending',
    });

    const result = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        ...createManagedLifecycleState(),
        anchoredPayloadRecords: [createAnchoredPayloadRecord()],
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
          statusMessage:
            'Anchored payload ref "txpayload-ember-lending-001" does not contain transaction step 3.',
        },
      },
    });
    expect(runtimeSigning.signPayload).not.toHaveBeenCalled();
  });

  it('resolves prepared unsigned transactions from the anchored lending-service payload store when no harness resolver is injected', async () => {
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
            execution_result: createReadyForExecutionSigningPreparationResult({
              inlineUnsignedTransactionHex: null,
            }),
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
          signature: TEST_TRANSACTION_SIGNATURE,
          recoveryId: 1,
        },
      })),
    );
    const anchoredPayloadResolver = createAnchoredPayloadResolverStub();
    const domain = createEmberLendingDomain({
      protocolHost,
      runtimeSigning,
      anchoredPayloadResolver,
      runtimeSignerRef: 'service-wallet',
      agentId: 'ember-lending',
    });

    await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        ...createManagedLifecycleState(),
        anchoredPayloadRecords: [createAnchoredPayloadRecord()],
        lastCandidatePlan: {
          transaction_plan_id: 'txplan-ember-lending-001',
          handoff: {
            payload_builder_output: {
              transaction_payload_ref: 'txpayload-ember-lending-001',
              required_control_path: 'lending.supply',
              network: 'arbitrum',
            },
          },
        },
        lastCandidatePlanSummary: 'supply reserved USDC on Aave',
      },
      operation: {
        source: 'tool',
        name: 'request_transaction_execution',
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
      anchoredPayloadRecords: [createAnchoredPayloadRecord()],
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
          execution_result: createReadyForExecutionSigningPreparationResult({
            inlineUnsignedTransactionHex: undefined,
          }),
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
        idempotency_key: DEFAULT_EXECUTION_IDEMPOTENCY_KEY,
        expected_revision: 7,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-transaction-execution',
      method: 'subagent.requestTransactionExecution.v1',
      params: {
      idempotency_key: `${DEFAULT_EXECUTION_IDEMPOTENCY_KEY}:await-execution-progress:8`,
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
        idempotency_key: `${DEFAULT_EXECUTION_IDEMPOTENCY_KEY}:submit-transaction:req-ember-lending-execution-001`,
        expected_revision: 9,
        transaction_plan_id: 'txplan-ember-lending-001',
        signed_transaction: expect.objectContaining({
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
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

  it('returns a waiting status when Shared Ember-managed redelegation does not advance before the internal wait timeout', async () => {
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
        id: 'shared-ember-thread-1-wait-committed-event-outbox',
        result: {
          protocol_version: 'v1',
          revision: 9,
          events: [],
        },
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 9,
        events: [
          {
            sequence: 5,
            aggregate: 'request',
            aggregate_id: 'req-ember-lending-execution-001',
            event_type: 'requestExecution.prepared.v1',
            payload: {
              request_id: 'req-ember-lending-execution-001',
              transaction_plan_id: 'txplan-ember-lending-001',
              phase: 'ready_for_redelegation',
            },
          },
        ],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 9,
        consumer_id: 'ember-lending',
        acknowledged_through_sequence: 0,
      })),
    };
    const runtimeSigning = createRuntimeSigningStub(
      vi.fn(async ({ payloadKind }) => {
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

    expect(result).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 9,
        lastExecutionResult: {
          phase: 'ready_for_redelegation',
        },
        lastExecutionTxHash: null,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage:
            'Lending transaction execution is waiting for Shared Ember-managed redelegation.',
        },
      },
    });

    expect(runtimeSigning.signPayload).not.toHaveBeenCalled();
    expect(protocolHost.handleJsonRpc).toHaveBeenCalledTimes(2);
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-transaction-execution',
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: DEFAULT_EXECUTION_IDEMPOTENCY_KEY,
        expected_revision: 7,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
    expect(protocolHost.readCommittedEventOutbox).toHaveBeenCalledWith({
      protocol_version: 'v1',
      consumer_id: 'ember-lending-req-ember-lending-execution-001',
      after_sequence: 0,
      limit: 100,
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-wait-committed-event-outbox',
      method: 'waitCommittedEventOutbox.v1',
      params: {
        consumer_id: 'ember-lending-req-ember-lending-execution-001',
        after_sequence: 5,
        limit: 100,
        timeout_ms: 1000,
      },
    });
  });

  it('waits through Shared Ember-managed redelegation and then resumes local execution signing and submission', async () => {
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
          id: 'shared-ember-thread-1-wait-committed-event-outbox',
          result: {
            protocol_version: 'v1',
            revision: 10,
            events: [
              {
                sequence: 6,
                aggregate: 'request',
                aggregate_id: 'req-ember-lending-execution-001',
                event_type: 'requestExecution.prepared.v1',
                payload: {
                  request_id: 'req-ember-lending-execution-001',
                  transaction_plan_id: 'txplan-ember-lending-001',
                  phase: 'ready_for_execution_signing',
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-request-transaction-execution',
          result: {
            protocol_version: 'v1',
            revision: 10,
            committed_event_ids: ['evt-prepare-execution-1'],
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
        revision: 9,
        events: [
          {
            sequence: 5,
            aggregate: 'request',
            aggregate_id: 'req-ember-lending-execution-001',
            event_type: 'requestExecution.prepared.v1',
            payload: {
              request_id: 'req-ember-lending-execution-001',
              transaction_plan_id: 'txplan-ember-lending-001',
              phase: 'ready_for_redelegation',
            },
          },
        ],
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

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-transaction-execution',
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: DEFAULT_EXECUTION_IDEMPOTENCY_KEY,
        expected_revision: 7,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-wait-committed-event-outbox',
      method: 'waitCommittedEventOutbox.v1',
      params: {
        consumer_id: 'ember-lending-req-ember-lending-execution-001',
        after_sequence: 5,
        limit: 100,
        timeout_ms: 1000,
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(3, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-request-transaction-execution',
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: `${DEFAULT_EXECUTION_IDEMPOTENCY_KEY}:await-execution-progress:10`,
        expected_revision: 10,
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
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(4, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-submit-signed-transaction',
      method: 'subagent.submitSignedTransaction.v1',
      params: {
        idempotency_key: `${DEFAULT_EXECUTION_IDEMPOTENCY_KEY}:submit-transaction:req-ember-lending-execution-001`,
        expected_revision: 10,
        transaction_plan_id: 'txplan-ember-lending-001',
        signed_transaction: expect.objectContaining({
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
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
        message: 'confirmation_timeout: awaiting later receipt',
        expectedStatus: 'completed' as const,
        expectedMessage:
          'Lending transaction submitted through Shared Ember: confirmation_timeout: awaiting later receipt.',
      },
      {
        status: 'failed_before_submission' as const,
        transactionHash: undefined,
        message:
          'send_insufficient_funds: rpc_32000: insufficient funds for gas * price + value',
        expectedStatus: 'failed' as const,
        expectedMessage:
          'Lending transaction failed before submission through Shared Ember: send_insufficient_funds: rpc_32000: insufficient funds for gas * price + value.',
      },
      {
        status: 'failed_after_submission' as const,
        transactionHash:
          '0x2222222222222222222222222222222222222222222222222222222222222222' as const,
        message: 'receipt_rpc_error: rpc_32000: header not found',
        expectedStatus: 'failed' as const,
        expectedMessage:
          'Lending transaction failed after submission through Shared Ember: receipt_rpc_error: rpc_32000: header not found.',
      },
      {
        status: 'partial_settlement' as const,
        transactionHash:
          '0x3333333333333333333333333333333333333333333333333333333333333333' as const,
        message: 'transaction_reverted: partial fill observed',
        expectedStatus: 'failed' as const,
        expectedMessage:
          'Lending transaction reached partial settlement through Shared Ember: transaction_reverted: partial fill observed.',
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
                message: scenario.message,
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
        idempotency_key: DEFAULT_EXECUTION_IDEMPOTENCY_KEY,
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
        idempotency_key: DEFAULT_EXECUTION_IDEMPOTENCY_KEY,
        expected_revision: 8,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(4, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-submit-signed-transaction',
      method: 'subagent.submitSignedTransaction.v1',
      params: {
        idempotency_key: `${DEFAULT_EXECUTION_IDEMPOTENCY_KEY}:submit-transaction:req-ember-lending-execution-001`,
        expected_revision: 9,
        transaction_plan_id: 'txplan-ember-lending-001',
        signed_transaction: expect.objectContaining({
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
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
        idempotency_key: `${DEFAULT_EXECUTION_IDEMPOTENCY_KEY}:submit-transaction:req-ember-lending-execution-001`,
        expected_revision: 10,
        transaction_plan_id: 'txplan-ember-lending-001',
        signed_transaction: expect.objectContaining({
          execution_preparation_id: 'execprep-ember-lending-001',
          transaction_plan_id: 'txplan-ember-lending-001',
          request_id: 'req-ember-lending-execution-001',
          active_delegation_id: 'del-ember-lending-001',
          canonical_unsigned_payload_ref: 'unsigned-txpayload-ember-lending-001',
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
          idempotencyKey: DEFAULT_EXECUTION_IDEMPOTENCY_KEY,
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
        if (request.method === 'subagent.readPortfolioState.v1') {
          return createLeanPortfolioStateResponse();
        }

        if (request.method === 'subagent.readExecutionContext.v1') {
          return createEmptyExecutionContextResponse();
        }

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
      handleJsonRpc: vi.fn(async (input: unknown) => {
        const request = input as { method?: string };
        if (request.method === 'subagent.readPortfolioState.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-portfolio-state',
            result: {
              protocol_version: 'v1',
              revision: 8,
              portfolio_state: {
                agent_id: 'ember-lending',
                rooted_wallet_context_id: 'rwc-ember-lending-thread-001',
                root_user_wallet: '0x00000000000000000000000000000000000000a1',
                agent_wallet: '0x00000000000000000000000000000000000000a1',
                mandate: {
                  mandate_ref: 'mandate-ember-lending-001',
                  summary:
                    'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
                  context: {
                    network: 'arbitrum',
                    protocol: 'aave',
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

        if (request.method === 'subagent.readExecutionContext.v1') {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-execution-context',
            result: {
              protocol_version: 'v1',
              revision: 8,
              execution_context: {
                generated_at: '2026-04-01T06:00:00.000Z',
                network: 'arbitrum',
                mandate_ref: 'mandate-ember-lending-001',
                mandate_summary:
                  'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
                mandate_context: null,
                subagent_wallet_address: '0x00000000000000000000000000000000000000a1',
                root_user_wallet_address: '0x00000000000000000000000000000000000000a1',
                owned_units: [],
                wallet_contents: [],
              },
            },
          };
        }

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
            'Portfolio Manager onboarding must complete before lending can plan transactions for this thread.',
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
