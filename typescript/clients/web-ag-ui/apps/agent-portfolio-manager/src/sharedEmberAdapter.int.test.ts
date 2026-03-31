import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPortfolioManagerDomain } from './sharedEmberAdapter.js';
import { createPortfolioManagerSharedEmberHttpHost } from './sharedEmberHttpHost.js';

type StartedSharedEmberTarget = {
  baseUrl: string;
  close: () => Promise<void>;
};

const runSharedEmberIntegration = process.env['RUN_SHARED_EMBER_INT']?.trim() === '1';
const describeSharedEmberIntegration = runSharedEmberIntegration ? describe : describe.skip;

async function resolveSharedEmberTarget(): Promise<StartedSharedEmberTarget> {
  const explicitBaseUrl = process.env['SHARED_EMBER_BASE_URL']?.trim();
  if (explicitBaseUrl) {
    return {
      baseUrl: explicitBaseUrl,
      close: async () => undefined,
    };
  }

  const privateRepoRoot = process.env['EMBER_ORCHESTRATION_V1_SPEC_ROOT']?.trim();
  if (!privateRepoRoot) {
    throw new Error(
      'Set SHARED_EMBER_BASE_URL or EMBER_ORCHESTRATION_V1_SPEC_ROOT when RUN_SHARED_EMBER_INT=1.',
    );
  }

  if (!existsSync(path.join(privateRepoRoot, 'node_modules'))) {
    throw new Error(
      'The private ember-orchestration-v1-spec repo must have dependencies installed before running shared Ember integration tests.',
    );
  }

  const harnessModule = (await import(
    pathToFileURL(path.join(privateRepoRoot, 'scripts/shared-domain-service-repo-harness.ts')).href
  )) as {
    startRepoLocalSharedEmberDomainProtocolHttpServer: () => Promise<StartedSharedEmberTarget>;
  };

  return harnessModule.startRepoLocalSharedEmberDomainProtocolHttpServer();
}

function createRootDelegationHandoff(suffix: string) {
  return {
    handoff_id: `handoff-root-portfolio-int-${suffix}`,
    root_delegation_id: `root-user-portfolio-int-${suffix}`,
    user_id: 'user_idle',
    user_wallet: '0xUSERPROTO1',
    orchestrator_wallet: '0xORCHPORTFOLIO1',
    network: 'base',
    artifact_ref: `artifact-root-portfolio-int-${suffix}`,
    issued_at: '2026-03-29T00:00:00Z',
    activated_at: '2026-03-29T00:00:05Z',
    signer_kind: 'delegation_toolkit',
    metadata: {
      delegation_manager: '0xDELEGATIONMANAGERPORTFOLIO1',
    },
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
      },
    },
    mandates: [
      {
        mandate_ref: 'mandate-portfolio-protocol-001',
        agent_id: 'portfolio-manager',
        mandate_summary: 'preserve direct-user liquidity',
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

describeSharedEmberIntegration('portfolio-manager Shared Ember sidecar integration', () => {
  let target: StartedSharedEmberTarget;

  beforeAll(async () => {
    target = await resolveSharedEmberTarget();
  });

  afterAll(async () => {
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
          agent_id: 'portfolio-manager',
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
              control_path: 'unassigned',
            }),
          ],
          reservations: [
            expect.objectContaining({
              control_path: 'unassigned',
            }),
          ],
          policy_snapshots: [
            expect.objectContaining({
              control_paths: ['unassigned'],
            }),
          ],
        },
      },
    });
  });
});
