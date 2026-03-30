import { describe, expect, it, vi } from 'vitest';

import { createPortfolioManagerDomain } from './sharedEmberAdapter.js';

function createOnboardingBootstrap() {
  return {
    occurredAt: '2026-03-29T00:06:00Z',
    rootedWalletContext: {
      rooted_wallet_context_id: 'rwc-user-protocol-001',
      user_id: 'user_idle',
      wallet_address: '0xUSERPROTO1',
      network: 'base',
      registered_at: '2026-03-29T00:00:00Z',
      metadata: {
        source: 'onboarding_scan',
      },
    },
    mandates: [
      {
        mandate_ref: 'mandate-portfolio-protocol-001',
        agent_id: 'portfolio',
        mandate_summary: 'preserve direct-user liquidity',
      },
    ],
    capitalObservation: {
      observation_id: 'obs-onboard-protocol-001',
      kind: 'onboarding_scan',
      wallet_address: '0xUSERPROTO1',
      network: 'base',
      observed_at: '2026-03-29T00:00:00Z',
      benchmark_asset: 'USD',
      valuation_ref: 'val-onboard-protocol-001',
      asset_deltas: [{ root_asset: 'USDC', quantity_delta: '900' }],
      affected_unit_ids: ['unit-usdc-onboard-protocol-001'],
    },
    userReservePolicies: [
      {
        reserve_policy_ref: 'reserve-policy-portfolio-protocol-001',
        summary: 'keep 500 USDC liquid',
        user_reserve_rules: [
          {
            root_asset: 'USDC',
            network: 'base',
            benchmark_asset: 'USD',
            reserved_quantity: '500',
            reason: 'keep 500 USDC liquid',
          },
        ],
      },
    ],
    ownedUnits: [
      {
        unit_id: 'unit-usdc-onboard-protocol-001',
        root_asset: 'USDC',
        network: 'base',
        wallet_address: '0xUSERPROTO1',
        quantity: '900',
        owner_type: 'user_idle',
        owner_id: 'user_idle',
        status: 'reserved',
        reservation_id: 'res-yield-bootstrap-protocol-001',
        delegation_id: null,
        control_path: 'unassigned',
        position_kind: 'unassigned',
        benchmark_asset: 'USD',
        benchmark_value: '900',
        valuation_ref: 'val-onboard-protocol-001',
        cost_basis: '900',
        opened_at: '2026-03-29T00:00:00Z',
        closed_at: null,
        parent_unit_ids: [],
        metadata: {
          source: 'onboarding_scan',
        },
      },
    ],
    reservations: [
      {
        reservation_id: 'res-yield-bootstrap-protocol-001',
        agent_id: 'yield',
        owner_id: 'user_idle',
        purpose: 'deploy',
        control_path: 'vault.deposit',
        unit_allocations: [{ unit_id: 'unit-usdc-onboard-protocol-001', quantity: '900' }],
        status: 'active',
        created_at: '2026-03-29T00:05:00Z',
        released_at: null,
        superseded_by: null,
      },
    ],
    policySnapshots: [
      {
        policy_snapshot_ref: 'pol-yield-bootstrap-protocol-001',
        agent_id: 'yield',
        network: 'base',
        control_paths: ['vault.deposit'],
        unit_bounds: [{ unit_id: 'unit-usdc-onboard-protocol-001', quantity: '900' }],
        created_at: '2026-03-29T00:05:00Z',
      },
    ],
  };
}

describe('createPortfolioManagerDomain', () => {
  it('translates register_root_delegation_from_user_signing into the Shared Ember root-delegation command', async () => {
    const handoff = {
      handoff_id: 'handoff-root-protocol-001',
      root_delegation_id: 'root-user-protocol-001',
      user_id: 'user_idle',
      user_wallet: '0xUSERPROTO1',
      orchestrator_wallet: '0xORCHPROTO1',
      network: 'base',
      artifact_ref: 'artifact-root-protocol-001',
      issued_at: '2026-03-29T00:00:00Z',
      activated_at: '2026-03-29T00:00:05Z',
      signer_kind: 'delegation_toolkit',
      metadata: {
        delegation_manager: '0xDELEGATIONMANAGERPROTO1',
      },
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-register-root-delegation',
        result: {
          protocol_version: 'v1',
          revision: 1,
          committed_event_ids: ['evt-root-delegation-1'],
          root_delegation: {
            root_delegation_id: 'root-user-protocol-001',
            user_id: 'user_idle',
            user_wallet: '0xUSERPROTO1',
            orchestrator_wallet: '0xORCHPROTO1',
            network: 'base',
            status: 'active',
            issued_at: '2026-03-29T00:00:00Z',
            activated_at: '2026-03-29T00:00:05Z',
            revoked_at: null,
            artifact_ref: 'artifact-root-protocol-001',
            metadata: {
              delegation_manager: '0xDELEGATIONMANAGERPROTO1',
            },
          },
        },
      })),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 1,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 1,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'prehire',
          lastPortfolioState: null,
          lastSharedEmberRevision: 0,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
        },
        operation: {
          source: 'tool',
          name: 'register_root_delegation_from_user_signing',
          input: {
            idempotencyKey: 'idem-root-protocol-001',
            handoff,
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        lastSharedEmberRevision: 1,
        lastRootDelegation: {
          root_delegation_id: 'root-user-protocol-001',
          user_wallet: '0xUSERPROTO1',
          status: 'active',
        },
        lastOnboardingBootstrap: null,
        lastRootedWalletContextId: null,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Root delegation registered with Shared Ember Domain Service.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-root-delegation',
              revision: 1,
              committedEventIds: ['evt-root-delegation-1'],
              rootDelegation: {
                root_delegation_id: 'root-user-protocol-001',
                user_wallet: '0xUSERPROTO1',
                status: 'active',
              },
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-register-root-delegation',
      method: 'orchestrator.registerRootDelegationFromUserSigning.v1',
      params: {
        idempotency_key: 'idem-root-protocol-001',
        expected_revision: 0,
        handoff,
      },
    });
  });

  it('translates complete_onboarding_bootstrap into the Shared Ember onboarding-bootstrap command', async () => {
    const onboarding = createOnboardingBootstrap();
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-complete-onboarding-bootstrap',
        result: {
          protocol_version: 'v1',
          revision: 2,
          committed_event_ids: ['evt-onboarding-bootstrap-2'],
          onboarding_bootstrap: {
            rootedWalletContext: {
              rooted_wallet_context_id: 'rwc-user-protocol-001',
            },
            decision: {
              decision_ref: 'decision-yield-bootstrap-protocol-001',
              chosen_path: 'deploy_idle_capital',
            },
            subagentPromptHydrations: [
              {
                agent_id: 'yield',
                hydration_ref: 'hydration-yield-bootstrap-protocol-001',
              },
            ],
          },
        },
      })),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 2,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 2,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 1,
          lastRootDelegation: {
            root_delegation_id: 'root-user-protocol-001',
          },
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
        },
        operation: {
          source: 'tool',
          name: 'complete_onboarding_bootstrap',
          input: {
            idempotencyKey: 'idem-onboarding-protocol-001',
            onboarding,
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        lastSharedEmberRevision: 2,
        lastRootDelegation: {
          root_delegation_id: 'root-user-protocol-001',
        },
        lastOnboardingBootstrap: {
          rootedWalletContext: {
            rooted_wallet_context_id: 'rwc-user-protocol-001',
          },
        },
        lastRootedWalletContextId: null,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Onboarding bootstrap completed with Shared Ember Domain Service.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-onboarding-bootstrap',
              revision: 2,
              committedEventIds: ['evt-onboarding-bootstrap-2'],
              onboardingBootstrap: {
                rootedWalletContext: {
                  rooted_wallet_context_id: 'rwc-user-protocol-001',
                },
              },
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-complete-onboarding-bootstrap',
      method: 'orchestrator.completeOnboardingBootstrap.v1',
      params: {
        idempotency_key: 'idem-onboarding-protocol-001',
        expected_revision: 1,
        onboarding,
      },
    });
  });

  it('translates complete_rooted_bootstrap_from_user_signing into the Shared Ember rooted-bootstrap command', async () => {
    const onboarding = createOnboardingBootstrap();
    const handoff = {
      handoff_id: 'handoff-root-protocol-001',
      root_delegation_id: 'root-user-protocol-001',
      user_id: 'user_idle',
      user_wallet: '0xUSERPROTO1',
      orchestrator_wallet: '0xORCHPROTO1',
      network: 'base',
      artifact_ref: 'artifact-root-protocol-001',
      issued_at: '2026-03-29T00:00:00Z',
      activated_at: '2026-03-29T00:00:05Z',
      signer_kind: 'delegation_toolkit',
      metadata: {
        delegation_manager: '0xDELEGATIONMANAGERPROTO1',
      },
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-complete-rooted-bootstrap',
        result: {
          protocol_version: 'v1',
          revision: 3,
          committed_event_ids: ['evt-rooted-bootstrap-1', 'evt-rooted-bootstrap-2'],
          rooted_wallet_context_id: 'rwc-user-protocol-001',
          root_delegation: {
            root_delegation_id: 'root-user-protocol-001',
            user_wallet: '0xUSERPROTO1',
            status: 'active',
          },
        },
      })),
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

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: 0,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
        },
        operation: {
          source: 'tool',
          name: 'complete_rooted_bootstrap_from_user_signing',
          input: {
            idempotencyKey: 'idem-rooted-bootstrap-protocol-001',
            onboarding,
            handoff,
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        lastSharedEmberRevision: 3,
        lastRootDelegation: {
          root_delegation_id: 'root-user-protocol-001',
          user_wallet: '0xUSERPROTO1',
          status: 'active',
        },
        lastOnboardingBootstrap: null,
        lastRootedWalletContextId: 'rwc-user-protocol-001',
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Rooted bootstrap completed with Shared Ember Domain Service.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-rooted-bootstrap',
              revision: 3,
              committedEventIds: ['evt-rooted-bootstrap-1', 'evt-rooted-bootstrap-2'],
              rootedWalletContextId: 'rwc-user-protocol-001',
              rootDelegation: {
                root_delegation_id: 'root-user-protocol-001',
                user_wallet: '0xUSERPROTO1',
                status: 'active',
              },
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-complete-rooted-bootstrap',
      method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
      params: {
        idempotency_key: 'idem-rooted-bootstrap-protocol-001',
        expected_revision: 0,
        onboarding,
        handoff,
      },
    });
  });

  it('translates refresh_portfolio_state into the Shared Ember portfolio-state query', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-thread-1-read-portfolio-state',
        result: {
          protocol_version: 'v1',
          revision: 7,
          portfolio_state: {
            policy: 'capital-preservation',
            units: [
              {
                agent_id: 'portfolio-manager',
                unit_id: 'unit-1',
                symbol: 'USDC',
              },
            ],
          },
        },
      })),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 7,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 7,
        consumer_id: 'portfolio-manager',
        acknowledged_through_sequence: 0,
      })),
    };

    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'prehire',
          lastPortfolioState: null,
          lastSharedEmberRevision: null,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
        },
        operation: {
          source: 'tool',
          name: 'refresh_portfolio_state',
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'prehire',
        lastSharedEmberRevision: 7,
        lastRootDelegation: null,
        lastOnboardingBootstrap: null,
        lastRootedWalletContextId: null,
        lastPortfolioState: {
          policy: 'capital-preservation',
          units: [
            {
              agent_id: 'portfolio-manager',
              unit_id: 'unit-1',
              symbol: 'USDC',
            },
          ],
        },
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Portfolio state refreshed from Shared Ember Domain Service.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-portfolio-state',
              revision: 7,
              portfolioState: {
                policy: 'capital-preservation',
                units: [
                  {
                    agent_id: 'portfolio-manager',
                    unit_id: 'unit-1',
                    symbol: 'USDC',
                  },
                ],
              },
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
        agent_id: 'portfolio-manager',
      },
    });
  });
});
