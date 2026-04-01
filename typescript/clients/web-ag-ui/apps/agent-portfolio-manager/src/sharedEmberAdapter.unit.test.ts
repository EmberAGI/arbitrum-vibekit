import { describe, expect, it, vi } from 'vitest';

import { createPortfolioManagerDomain } from './sharedEmberAdapter.js';

function createPortfolioManagerSetupInput() {
  return {
    walletAddress: '0x00000000000000000000000000000000000000a1' as const,
    portfolioMandate: {
      approved: true,
      riskLevel: 'medium' as const,
    },
    managedAgentMandates: [
      {
        agentKey: 'ember-lending-primary',
        agentType: 'ember-lending',
        approved: true,
        settings: {
          network: 'arbitrum',
          protocol: 'aave',
          allowedCollateralAssets: ['USDC'],
          allowedBorrowAssets: ['USDC'],
          maxAllocationPct: 35,
          maxLtvBps: 7000,
          minHealthFactor: '1.25',
        },
      },
    ],
  };
}

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
        approvedMandateEnvelope: {
          portfolioMandate: {
            approved: true,
            riskLevel: 'medium',
          },
          managedAgentMandates: [
            {
              agentKey: 'ember-lending-primary',
              agentType: 'ember-lending',
              approved: true,
              settings: {
                network: 'arbitrum',
                protocol: 'aave',
                allowedCollateralAssets: ['USDC'],
                allowedBorrowAssets: ['USDC'],
                maxAllocationPct: 35,
                maxLtvBps: 7000,
                minHealthFactor: '1.25',
              },
            },
          ],
        },
      },
    },
    mandates: [
      {
        mandate_ref: 'mandate-portfolio-protocol-001',
        agent_id: 'portfolio-manager',
        mandate_summary: 'preserve direct-user liquidity',
      },
      {
        mandate_ref: 'mandate-ember-lending-protocol-001',
        agent_id: 'ember-lending',
        mandate_summary: 'lend USDC on Aave within medium-risk allocation and health-factor guardrails',
      },
    ],
    userReservePolicies: [],
    activation: {
      agentId: 'portfolio-manager',
      purpose: 'deploy',
      controlPath: 'unassigned',
    },
  };
}

describe('createPortfolioManagerDomain', () => {
  it('starts hire by moving into onboarding and requesting portfolio-manager setup input', async () => {
    const domain = createPortfolioManagerDomain({
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
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'command',
          name: 'hire',
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
      },
      outputs: {
        status: {
          executionStatus: 'interrupted',
          statusMessage: 'Connect the wallet you want the portfolio manager to onboard.',
        },
        interrupt: {
          type: 'portfolio-manager-setup-request',
          surfacedInThread: true,
          message: 'Connect the wallet you want the portfolio manager to onboard.',
        },
      },
    });
  });

  it('turns the approved mandate envelope into a delegation-signing interrupt', async () => {
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: null,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-setup-request',
          input: createPortfolioManagerSetupInput(),
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
      },
      outputs: {
        status: {
          executionStatus: 'interrupted',
          statusMessage: 'Review and sign the delegation needed to activate your portfolio manager.',
        },
        interrupt: {
          type: 'portfolio-manager-delegation-signing-request',
          surfacedInThread: true,
          message: 'Review and sign the delegation needed to activate your portfolio manager.',
          payload: {
            chainId: 42161,
            delegatorAddress: '0x00000000000000000000000000000000000000a1',
            delegateeAddress: '0x2222222222222222222222222222222222222222',
            delegationManager: '0x1111111111111111111111111111111111111111',
            descriptions: ['Authorize the portfolio manager to operate through your root delegation.'],
            delegationsToSign: [
              expect.objectContaining({
                delegate: '0x2222222222222222222222222222222222222222',
                delegator: '0x00000000000000000000000000000000000000a1',
                authority: '0x0000000000000000000000000000000000000000000000000000000000000000',
                salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
              }),
            ],
          },
        },
      },
    });
  });

  it('completes onboarding after signed delegations are supplied through the signing interrupt', async () => {
    const signedDelegation = {
      delegate: '0x2222222222222222222222222222222222222222',
      delegator: '0x00000000000000000000000000000000000000a1',
      authority: '0x0000000000000000000000000000000000000000000000000000000000000000',
      caveats: [],
      salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
      signature: '0x1234',
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
            user_wallet: '0x00000000000000000000000000000000000000a1',
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
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedMandateEnvelope: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            managedAgentMandates: createPortfolioManagerSetupInput().managedAgentMandates,
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'signed',
            signedDelegations: [signedDelegation],
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 3,
        lastRootDelegation: {
          root_delegation_id: 'root-user-protocol-001',
          user_wallet: '0x00000000000000000000000000000000000000a1',
          status: 'active',
        },
        lastRootedWalletContextId: 'rwc-user-protocol-001',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: null,
      },
      outputs: {
        status: {
          executionStatus: 'working',
          statusMessage: 'Portfolio manager onboarding complete. Agent is active.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-rooted-bootstrap',
              rootedWalletContextId: 'rwc-user-protocol-001',
            },
          },
        ],
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonrpc: '2.0',
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
        params: expect.objectContaining({
          expected_revision: 0,
          onboarding: expect.objectContaining({
            rootedWalletContext: expect.objectContaining({
              wallet_address: '0x00000000000000000000000000000000000000a1',
              metadata: expect.objectContaining({
                approvedMandateEnvelope: {
                  portfolioMandate: {
                    approved: true,
                    riskLevel: 'medium',
                  },
                  managedAgentMandates: [
                    {
                      agentKey: 'ember-lending-primary',
                      agentType: 'ember-lending',
                      approved: true,
                      settings: {
                        network: 'arbitrum',
                        protocol: 'aave',
                        allowedCollateralAssets: ['USDC'],
                        allowedBorrowAssets: ['USDC'],
                        maxAllocationPct: 35,
                        maxLtvBps: 7000,
                        minHealthFactor: '1.25',
                      },
                    },
                  ],
                },
              }),
            }),
            userReservePolicies: [],
            mandates: [
              {
                mandate_ref: expect.stringContaining('mandate-'),
                agent_id: 'portfolio-manager',
                mandate_summary: 'preserve direct-user liquidity at medium risk while coordinating managed subagents',
              },
              {
                mandate_ref: expect.stringContaining('mandate-'),
                agent_id: 'ember-lending',
                mandate_summary:
                  'lend USDC on Aave within medium-risk allocation, LTV, and health-factor guardrails',
              },
            ],
            activation: {
              agentId: 'portfolio-manager',
              purpose: 'deploy',
              controlPath: 'unassigned',
            },
          }),
          handoff: expect.objectContaining({
            user_wallet: '0x00000000000000000000000000000000000000a1',
            orchestrator_wallet: '0x2222222222222222222222222222222222222222',
            signer_kind: 'delegation_toolkit',
          }),
        }),
      }),
    );

    const rootedBootstrapRequest = protocolHost.handleJsonRpc.mock.calls[0]?.[0] as {
      params?: {
        onboarding?: Record<string, unknown>;
      };
    };

    expect(rootedBootstrapRequest.params?.onboarding).not.toHaveProperty('capitalObservation');
    expect(rootedBootstrapRequest.params?.onboarding).not.toHaveProperty('ownedUnits');
    expect(rootedBootstrapRequest.params?.onboarding).not.toHaveProperty('reservations');
    expect(rootedBootstrapRequest.params?.onboarding).not.toHaveProperty('policySnapshots');
  });

  it('returns to prehire and clears wallet-local state when delegation signing is rejected', async () => {
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: null,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedMandateEnvelope: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            managedAgentMandates: createPortfolioManagerSetupInput().managedAgentMandates,
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'rejected',
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'prehire',
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
      },
      outputs: {
        status: {
          executionStatus: 'canceled',
          statusMessage:
            'Portfolio manager onboarding was canceled because delegation signing was rejected.',
        },
      },
    });
  });

  it('reads the current Shared Ember revision before completing onboarding when the thread has no cached revision', async () => {
    const signedDelegation = {
      delegate: '0x2222222222222222222222222222222222222222',
      delegator: '0x00000000000000000000000000000000000000a1',
      authority: '0x0000000000000000000000000000000000000000000000000000000000000000',
      caveats: [],
      salt: '0x1111111111111111111111111111111111111111111111111111111111111111',
      signature: '0x1234',
    };
    const protocolHost = {
      handleJsonRpc: vi.fn(async (request: unknown) => {
        if (
          typeof request === 'object' &&
          request !== null &&
          'method' in request &&
          request.method === 'subagent.readPortfolioState.v1'
        ) {
          return {
            jsonrpc: '2.0',
            id: 'shared-ember-thread-1-read-current-revision',
            result: {
              protocol_version: 'v1',
              revision: 3,
              portfolio_state: {
                agent_id: 'portfolio-manager',
                owned_units: [],
                reservations: [],
              },
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-complete-rooted-bootstrap',
          result: {
            protocol_version: 'v1',
            revision: 4,
            committed_event_ids: ['evt-rooted-bootstrap-3', 'evt-rooted-bootstrap-4'],
            rooted_wallet_context_id: 'rwc-user-protocol-001',
            root_delegation: {
              root_delegation_id: 'root-user-protocol-001',
              user_wallet: '0x00000000000000000000000000000000000000a1',
              status: 'active',
            },
          },
        };
      }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 4,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 4,
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
          lastSharedEmberRevision: null,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingApprovedMandateEnvelope: {
            portfolioMandate: createPortfolioManagerSetupInput().portfolioMandate,
            managedAgentMandates: createPortfolioManagerSetupInput().managedAgentMandates,
          },
        },
        operation: {
          source: 'interrupt',
          name: 'portfolio-manager-delegation-signing-request',
          input: {
            outcome: 'signed',
            signedDelegations: [signedDelegation],
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: 4,
        lastRootedWalletContextId: 'rwc-user-protocol-001',
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-read-current-revision',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'portfolio-manager',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
        params: expect.objectContaining({
          expected_revision: 3,
        }),
      }),
    );
  });

  it('moves back to prehire on fire and allows hire to start again', async () => {
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
    });

    const fired = await domain.handleOperation?.({
      threadId: 'thread-1',
      state: {
        phase: 'active',
        lastPortfolioState: {
          positions: 1,
        },
        lastSharedEmberRevision: 3,
        lastRootDelegation: {
          root_delegation_id: 'root-user-protocol-001',
        },
        lastOnboardingBootstrap: createOnboardingBootstrap(),
        lastRootedWalletContextId: 'rwc-user-protocol-001',
        activeWalletAddress: '0x00000000000000000000000000000000000000a1',
        pendingOnboardingWalletAddress: null,
      },
      operation: {
        source: 'command',
        name: 'fire',
      },
    });

    expect(fired).toMatchObject({
      state: {
        phase: 'prehire',
        lastPortfolioState: {
          positions: 1,
        },
        lastSharedEmberRevision: 3,
        lastRootDelegation: null,
        lastOnboardingBootstrap: null,
        lastRootedWalletContextId: null,
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Portfolio manager fired. Ready to hire again.',
        },
      },
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-1',
        state: fired?.state,
        operation: {
          source: 'command',
          name: 'hire',
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
      },
      outputs: {
        status: {
          executionStatus: 'interrupted',
          statusMessage: 'Connect the wallet you want the portfolio manager to onboard.',
        },
        interrupt: {
          type: 'portfolio-manager-setup-request',
        },
      },
    });
  });

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
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
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
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
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
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
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

  it('retries rooted bootstrap once after a Shared Ember expected_revision conflict', async () => {
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
    } as const;
    const protocolHost = {
      handleJsonRpc: vi
        .fn()
        .mockRejectedValueOnce(
          new Error(
            'Shared Ember Domain Service JSON-RPC error: protocol_conflict: expected_revision must match the current service revision',
          ),
        )
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-read-current-revision',
          result: {
            protocol_version: 'v1',
            revision: 3,
            portfolio_state: {
              agent_id: 'portfolio-manager',
              owned_units: [],
              reservations: [],
            },
          },
        })
        .mockResolvedValueOnce({
          jsonrpc: '2.0',
          id: 'shared-ember-thread-1-complete-rooted-bootstrap',
          result: {
            protocol_version: 'v1',
            revision: 4,
            committed_event_ids: ['evt-rooted-bootstrap-3', 'evt-rooted-bootstrap-4'],
            rooted_wallet_context_id: 'rwc-user-protocol-001',
            root_delegation: {
              root_delegation_id: 'root-user-protocol-001',
              user_wallet: '0xUSERPROTO1',
              status: 'active',
            },
          },
        }),
      readCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 4,
        events: [],
      })),
      acknowledgeCommittedEventOutbox: vi.fn(async () => ({
        protocol_version: 'v1',
        revision: 4,
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
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
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
        lastSharedEmberRevision: 4,
        lastRootedWalletContextId: 'rwc-user-protocol-001',
      },
    });

    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(1, {
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
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-read-current-revision',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'portfolio-manager',
      },
    });
    expect(protocolHost.handleJsonRpc).toHaveBeenNthCalledWith(3, {
      jsonrpc: '2.0',
      id: 'shared-ember-thread-1-complete-rooted-bootstrap',
      method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
      params: {
        idempotency_key: 'idem-rooted-bootstrap-protocol-001',
        expected_revision: 3,
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
          activeWalletAddress: null,
          pendingOnboardingWalletAddress: null,
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
        activeWalletAddress: null,
        pendingOnboardingWalletAddress: null,
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

  it('injects the portfolio mandate and managed lending mandate set into system context', async () => {
    const domain = createPortfolioManagerDomain({
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.systemContext?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 4,
          lastRootDelegation: {
            root_delegation_id: 'root-a1',
          },
          lastOnboardingBootstrap: createOnboardingBootstrap(),
          lastRootedWalletContextId: 'rwc-user-protocol-001',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        '  <portfolio_mandate mandate_ref="mandate-portfolio-protocol-001" risk_level="medium">preserve direct-user liquidity</portfolio_mandate>',
        '  <managed_agent_mandates>',
        '    <managed_agent agent_key="ember-lending-primary" agent_type="ember-lending" approved="true" mandate_ref="mandate-ember-lending-protocol-001">',
        '      <summary>lend USDC on Aave within medium-risk allocation and health-factor guardrails</summary>',
        '      <network>arbitrum</network>',
        '      <protocol>aave</protocol>',
        '      <allowed_collateral_assets>USDC</allowed_collateral_assets>',
        '      <allowed_borrow_assets>USDC</allowed_borrow_assets>',
        '      <max_allocation_pct>35</max_allocation_pct>',
        '      <max_ltv_bps>7000</max_ltv_bps>',
        '      <min_health_factor>1.25</min_health_factor>',
        '    </managed_agent>',
        '  </managed_agent_mandates>',
      ]),
    );
  });

  it('appends live Shared Ember accounting context to the system prompt context when a wallet is active', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => ({
        jsonrpc: '2.0',
        id: 'shared-ember-wallet-accounting-portfolio-manager-0x00000000000000000000000000000000000000a1',
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
              reserve_policy_configured: true,
              capital_reserved_for_agent: true,
              policy_snapshot_recorded: true,
              agent_active: true,
            },
            rooted_wallet_context: {
              rooted_wallet_context_id: 'rwc-a1',
            },
            root_delegation: {
              root_delegation_id: 'root-a1',
            },
            owned_units: [
              {
                unit_id: 'unit-a1',
                root_asset: 'USDC',
                quantity: '10',
                status: 'reserved',
                control_path: 'unassigned',
                reservation_id: 'reservation-a1',
              },
            ],
            reservations: [
              {
                reservation_id: 'reservation-a1',
                agent_id: 'portfolio-manager',
                purpose: 'deploy',
                status: 'active',
                control_path: 'unassigned',
                unit_allocations: [
                  {
                    unit_id: 'unit-a1',
                    quantity: '10',
                  },
                ],
              },
            ],
          },
        },
      })),
      readCommittedEventOutbox: vi.fn(),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };
    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.systemContext?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 4,
          lastRootDelegation: null,
          lastOnboardingBootstrap: {
            rootedWalletContext: {
              wallet_address: '0x00000000000000000000000000000000000000a1',
            },
          },
          lastRootedWalletContextId: 'rwc-a1',
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        '<shared_ember_accounting_context freshness="live">',
        expect.stringMatching(/^  <generated_at>.+<\/generated_at>$/),
        '  <wallet_address>0x00000000000000000000000000000000000000a1</wallet_address>',
        '  <revision>4</revision>',
        '  <phase>active</phase>',
        '    <asset unit_id="unit-a1" reservation_id="reservation-a1">',
        '    <reservation reservation_id="reservation-a1" agent_id="portfolio-manager">',
      ]),
    );
  });

  it('marks live Shared Ember accounting context unavailable when the upstream read fails', async () => {
    const protocolHost = {
      handleJsonRpc: vi.fn(async () => {
        throw new Error('Shared Ember Domain Service HTTP request failed with status 503.');
      }),
      readCommittedEventOutbox: vi.fn(),
      acknowledgeCommittedEventOutbox: vi.fn(),
    };
    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    await expect(
      domain.systemContext?.({
        threadId: 'thread-1',
        state: {
          phase: 'active',
          lastPortfolioState: null,
          lastSharedEmberRevision: 4,
          lastRootDelegation: null,
          lastOnboardingBootstrap: null,
          lastRootedWalletContextId: null,
          activeWalletAddress: '0x00000000000000000000000000000000000000a1',
          pendingOnboardingWalletAddress: null,
        },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        '<shared_ember_accounting_context status="unavailable">',
        expect.stringMatching(/^  <generated_at>.+<\/generated_at>$/),
        '  <wallet_address>0x00000000000000000000000000000000000000a1</wallet_address>',
        '  <network>arbitrum</network>',
        '  <error>Shared Ember Domain Service HTTP request failed with status 503.</error>',
      ]),
    );
  });
});
