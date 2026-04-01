import { describe, expect, it, vi } from 'vitest';

import {
  createEmberLendingDomain,
  EMBER_LENDING_INTERNAL_HYDRATE_COMMAND,
} from './sharedEmberAdapter.js';

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
            request_id: 'req-ember-lending-execution-001',
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
        name: 'request_transaction_execution',
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
          statusMessage: 'Lending transaction plan admitted and executed through Shared Ember.',
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
      method: 'subagent.requestTransactionExecution.v1',
      params: {
        idempotency_key: 'idem-execute-transaction-plan-thread-1',
        expected_revision: 7,
        transaction_plan_id: 'txplan-ember-lending-001',
      },
    });
  });

  it('surfaces blocked execution requests without claiming the transaction plan executed', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-execute-transaction-plan',
        result: {
          protocol_version: 'v1',
          revision: 9,
          committed_event_ids: ['evt-request-execution-blocked-1'],
          execution_result: createBlockedExecutionResult({
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
              executionResult: {
                phase: 'blocked',
                transaction_plan_id: 'txplan-ember-lending-001',
                request_id: 'req-ember-lending-blocked-001',
              },
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
        id: 'shared-ember-thread-1-execute-transaction-plan',
        result: {
          protocol_version: 'v1',
          revision: 9,
          committed_event_ids: ['evt-request-execution-denied-1'],
          execution_result: createBlockedExecutionResult({
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
              executionResult: {
                phase: 'blocked',
                transaction_plan_id: 'txplan-ember-lending-001',
                request_id: 'req-ember-lending-denied-001',
              },
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
