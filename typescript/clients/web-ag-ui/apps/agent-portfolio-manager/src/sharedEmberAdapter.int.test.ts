import { ROOT_AUTHORITY } from '@metamask/delegation-toolkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPortfolioManagerDomain } from './sharedEmberAdapter.js';
import { createPortfolioManagerSharedEmberHttpHost } from './sharedEmberHttpHost.js';
import {
  resolveSharedEmberTarget,
  type StartedSharedEmberTarget,
} from './sharedEmberIntegrationHarness.js';

const runSharedEmberIntegration = process.env['RUN_SHARED_EMBER_INT']?.trim() === '1';
const describeSharedEmberIntegration = runSharedEmberIntegration ? describe : describe.skip;
const TEST_SIGNING_INTERRUPT_WALLET = '0x00000000000000000000000000000000000000a1' as const;
const TEST_USER_WALLET = '0x00000000000000000000000000000000000000b1' as const;
const TEST_ORCHESTRATOR_WALLET = '0x00000000000000000000000000000000000000b2' as const;
const TEST_DELEGATION_MANAGER = '0x00000000000000000000000000000000000000b3' as const;

function createRootDelegationHandoff(suffix: string) {
  return {
    handoff_id: `handoff-root-portfolio-int-${suffix}`,
    root_delegation_id: `root-user-portfolio-int-${suffix}`,
    user_id: 'user_idle',
    user_wallet: TEST_USER_WALLET,
    orchestrator_wallet: TEST_ORCHESTRATOR_WALLET,
    network: 'arbitrum',
    artifact_ref: `artifact-root-portfolio-int-${suffix}`,
    issued_at: '2026-03-29T00:00:00Z',
    activated_at: '2026-03-29T00:00:05Z',
    signer_kind: 'delegation_toolkit',
    metadata: {
      delegation_manager: TEST_DELEGATION_MANAGER,
    },
  };
}

function createPortfolioManagerSetupInput(walletAddress: `0x${string}`) {
  return {
    walletAddress,
    portfolioMandate: {
      approved: true,
      riskLevel: 'medium' as const,
    },
    firstManagedMandate: {
      targetAgentId: 'ember-lending' as const,
      targetAgentKey: 'ember-lending-primary',
      mandateSummary: 'lend USDC through the managed lending lane',
      managedMandate: {
        allocation_basis: 'allocable_idle' as const,
        allowed_assets: ['USDC'],
        asset_intent: {
          root_asset: 'USDC',
          protocol_system: 'aave',
          network: 'arbitrum' as const,
          benchmark_asset: 'USD',
          intent: 'position.enter' as const,
          control_path: 'lending.supply' as const,
        },
      },
    },
  };
}

function createSignedDelegation(walletAddress: `0x${string}`) {
  return {
    delegate: '0x2222222222222222222222222222222222222222' as const,
    delegator: walletAddress,
    authority: ROOT_AUTHORITY,
    caveats: [],
    salt: '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
    signature: '0x1234' as const,
  };
}

function createOnboardingBootstrap() {
  return {
    occurredAt: '2026-03-29T00:06:00Z',
    rootedWalletContext: {
      rooted_wallet_context_id: 'rwc-user-protocol-001',
      user_id: 'user_idle',
      wallet_address: TEST_USER_WALLET,
      network: 'arbitrum',
      registered_at: '2026-03-29T00:00:00Z',
      metadata: {
        source: 'onboarding_scan',
      },
    },
    mandates: [
      {
        mandate_ref: 'mandate-portfolio-protocol-001',
        agent_id: 'portfolio-manager',
        mandate_summary: 'preserve direct-user liquidity',
        managed_mandate: null,
      },
      {
        mandate_ref: 'mandate-ember-lending-protocol-001',
        agent_id: 'ember-lending',
        mandate_summary: 'lend USDC through the managed lending lane',
        managed_mandate: {
          allocation_basis: 'allocable_idle',
          allowed_assets: ['USDC'],
        asset_intent: {
          root_asset: 'USDC',
          protocol_system: 'aave',
          network: 'arbitrum',
          benchmark_asset: 'USD',
          intent: 'position.enter',
            control_path: 'lending.supply',
          },
        },
      },
    ],
    userReservePolicies: [
      {
        reserve_policy_ref: 'reserve-policy-ember-lending-protocol-001',
        summary: 'allow managed lending to admit allocable idle USDC',
        user_reserve_rules: [
          {
            root_asset: 'USDC',
            network: 'arbitrum',
            benchmark_asset: 'USD',
            reserved_quantity: '0',
            reason: 'allow managed lending to admit allocable idle USDC',
          },
        ],
      },
    ],
    activation: {
      mandateRef: 'mandate-ember-lending-protocol-001',
    },
  };
}

describeSharedEmberIntegration('portfolio-manager Shared Ember sidecar integration', () => {
  let target: StartedSharedEmberTarget;

  beforeEach(async () => {
    target = await resolveSharedEmberTarget();
  });

  afterEach(async () => {
    await target?.close();
  });

  it('refreshes portfolio state through the real Shared Ember HTTP boundary', async () => {
    const protocolHost = createPortfolioManagerSharedEmberHttpHost({
      baseUrl: target.baseUrl,
    });
    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    const response = await protocolHost.handleJsonRpc({
      jsonrpc: '2.0',
      id: 'rpc-shared-ember-int-001',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'portfolio-manager',
      },
    });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 'rpc-shared-ember-int-001',
      result: {
        protocol_version: 'v1',
      },
    });

    await expect(
      domain.handleOperation?.({
        threadId: 'thread-int-1',
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
            },
          },
        ],
      },
    });
  });

  it('registers root delegation through the real Shared Ember HTTP boundary', async () => {
    const protocolHost = createPortfolioManagerSharedEmberHttpHost({
      baseUrl: target.baseUrl,
    });
    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    const revisionResponse = (await protocolHost.handleJsonRpc({
      jsonrpc: '2.0',
      id: 'rpc-shared-ember-int-current-revision',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'portfolio-manager',
      },
    })) as {
      result?: {
        revision?: number;
      };
    };

    const suffix = Date.now().toString(36);
    const handoff = createRootDelegationHandoff(suffix);

    await expect(
      domain.handleOperation?.({
        threadId: `thread-root-int-${suffix}`,
        state: {
          phase: 'prehire',
          lastPortfolioState: null,
          lastSharedEmberRevision: revisionResponse.result?.revision ?? 0,
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
            idempotencyKey: `idem-root-portfolio-int-${suffix}`,
            handoff,
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        lastSharedEmberRevision: expect.any(Number),
        lastRootDelegation: {
          root_delegation_id: handoff.root_delegation_id,
          user_wallet: handoff.user_wallet,
          status: 'active',
        },
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
              rootDelegation: {
                root_delegation_id: handoff.root_delegation_id,
                user_wallet: handoff.user_wallet,
                status: 'active',
              },
            },
          },
        ],
      },
    });
  });

  it('completes rooted bootstrap through the real Shared Ember HTTP boundary', async () => {
    const protocolHost = createPortfolioManagerSharedEmberHttpHost({
      baseUrl: target.baseUrl,
    });
    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    const revisionResponse = (await protocolHost.handleJsonRpc({
      jsonrpc: '2.0',
      id: 'rpc-shared-ember-int-current-revision-rooted-bootstrap',
      method: 'subagent.readPortfolioState.v1',
      params: {
        agent_id: 'portfolio-manager',
      },
    })) as {
      result?: {
        revision?: number;
      };
    };

    const onboarding = createOnboardingBootstrap();
    const suffix = Date.now().toString(36);
    const handoff = createRootDelegationHandoff(suffix);

    await expect(
      domain.handleOperation?.({
        threadId: `thread-rooted-bootstrap-int-${suffix}`,
        state: {
          phase: 'onboarding',
          lastPortfolioState: null,
          lastSharedEmberRevision: revisionResponse.result?.revision ?? 0,
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
            idempotencyKey: `idem-rooted-bootstrap-portfolio-int-${suffix}`,
            onboarding,
            handoff,
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
        lastSharedEmberRevision: expect.any(Number),
        lastRootDelegation: {
          root_delegation_id: handoff.root_delegation_id,
          user_wallet: handoff.user_wallet,
          status: 'active',
        },
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
              rootedWalletContextId: 'rwc-user-protocol-001',
              rootDelegation: {
                root_delegation_id: handoff.root_delegation_id,
                user_wallet: handoff.user_wallet,
                status: 'active',
              },
            },
          },
        ],
      },
    });

    await expect(
      protocolHost.handleJsonRpc({
        jsonrpc: '2.0',
        id: `rpc-shared-ember-int-read-onboarding-${suffix}`,
        method: 'orchestrator.readOnboardingState.v1',
        params: {
          agent_id: 'ember-lending',
          wallet_address: onboarding.rootedWalletContext.wallet_address,
          network: onboarding.rootedWalletContext.network,
        },
      }),
    ).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: `rpc-shared-ember-int-read-onboarding-${suffix}`,
      result: {
        protocol_version: 'v1',
        onboarding_state: {
          phase: 'active',
          owned_units: [
            expect.objectContaining({
              control_path: 'lending.supply',
            }),
          ],
          reservations: [
            expect.objectContaining({
              control_path: 'lending.supply',
            }),
          ],
          policy_snapshots: [
            expect.objectContaining({
              control_paths: ['lending.supply'],
            }),
          ],
        },
      },
    });
  });

  it('completes rooted bootstrap from the signing interrupt through the real Shared Ember HTTP boundary', async () => {
    const protocolHost = createPortfolioManagerSharedEmberHttpHost({
      baseUrl: target.baseUrl,
    });
    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });

    const suffix = Date.now().toString(16);
    const walletAddress = TEST_SIGNING_INTERRUPT_WALLET;
    const threadId = `thread-rooted-bootstrap-signing-int-${suffix}`;
    const setupInput = createPortfolioManagerSetupInput(walletAddress);

    const setupResult = await domain.handleOperation?.({
      threadId,
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
        source: 'interrupt',
        name: 'portfolio-manager-setup-request',
        input: setupInput,
      },
    });

    expect(setupResult).toMatchObject({
      state: {
        phase: 'onboarding',
        activeWalletAddress: walletAddress,
        pendingOnboardingWalletAddress: walletAddress,
      },
      outputs: {
        status: {
          executionStatus: 'interrupted',
          statusMessage: 'Review and sign the delegation needed to activate your portfolio manager.',
        },
        interrupt: {
          type: 'portfolio-manager-delegation-signing-request',
        },
      },
    });

    const signingResult = await domain.handleOperation?.({
      threadId,
      state: setupResult?.state,
      operation: {
        source: 'interrupt',
        name: 'portfolio-manager-delegation-signing-request',
        input: {
          outcome: 'signed',
          signedDelegations: [createSignedDelegation(walletAddress)],
        },
      },
    });

    expect(signingResult).toMatchObject({
      state: {
        phase: 'active',
        lastSharedEmberRevision: expect.any(Number),
        lastRootDelegation: {
          user_wallet: walletAddress,
          status: 'active',
        },
        lastRootedWalletContextId: expect.any(String),
        activeWalletAddress: walletAddress,
        pendingOnboardingWalletAddress: null,
      },
      outputs: {
        status: {
          executionStatus: 'completed',
          statusMessage: 'Portfolio manager onboarding complete. Agent is active.',
        },
        artifacts: [
          {
            data: {
              type: 'shared-ember-rooted-bootstrap',
              rootedWalletContextId: expect.any(String),
              rootDelegation: {
                user_wallet: walletAddress,
                status: 'active',
              },
            },
          },
        ],
      },
    });

    await expect(
      protocolHost.handleJsonRpc({
        jsonrpc: '2.0',
        id: `rpc-shared-ember-int-read-onboarding-signing-${suffix}`,
        method: 'orchestrator.readOnboardingState.v1',
        params: {
          agent_id: 'ember-lending',
          wallet_address: walletAddress,
          network: 'arbitrum',
        },
      }),
    ).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: `rpc-shared-ember-int-read-onboarding-signing-${suffix}`,
      result: {
        protocol_version: 'v1',
        onboarding_state: {
          phase: 'active',
          rooted_wallet_context: {
            rooted_wallet_context_id: expect.any(String),
          },
          reservations: expect.arrayContaining([
            expect.objectContaining({
              control_path: 'lending.supply',
            }),
          ]),
          policy_snapshots: expect.arrayContaining([
            expect.objectContaining({
              control_paths: ['lending.supply'],
            }),
          ]),
        },
      },
    });

    await expect(
      protocolHost.handleJsonRpc({
        jsonrpc: '2.0',
        id: `rpc-shared-ember-int-read-execution-context-signing-${suffix}`,
        method: 'subagent.readExecutionContext.v1',
        params: {
          agent_id: 'ember-lending',
        },
      }),
    ).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: `rpc-shared-ember-int-read-execution-context-signing-${suffix}`,
      result: {
        protocol_version: 'v1',
        execution_context: {
          subagent_wallet_address: expect.stringMatching(/^0x/),
        },
      },
    });
  });
});
