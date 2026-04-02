import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPortfolioManagerDomain } from './sharedEmberAdapter.js';
import { createPortfolioManagerSharedEmberHttpHost } from './sharedEmberHttpHost.js';
import {
  resolveSharedEmberTarget,
  type StartedSharedEmberTarget,
} from './sharedEmberIntegrationHarness.js';
import { createPortfolioManagerWalletAccountingTool } from './walletAccountingTool.js';

const runSharedEmberIntegration = process.env['RUN_SHARED_EMBER_INT']?.trim() === '1';
const describeSharedEmberIntegration = runSharedEmberIntegration ? describe : describe.skip;

function createUniqueWalletAddress(seed: number): `0x${string}` {
  return `0x${seed.toString(16).padStart(40, '0')}` as `0x${string}`;
}

function createRootDelegationHandoff(suffix: string, walletAddress: `0x${string}`) {
  return {
    handoff_id: `handoff-root-wallet-accounting-${suffix}`,
    root_delegation_id: `root-wallet-accounting-${suffix}`,
    user_id: `user-wallet-accounting-${suffix}`,
    user_wallet: walletAddress,
    orchestrator_wallet: '0x2222222222222222222222222222222222222222',
    network: 'arbitrum',
    artifact_ref: `artifact-root-wallet-accounting-${suffix}`,
    issued_at: '2026-03-30T00:00:00.000Z',
    activated_at: '2026-03-30T00:00:00.000Z',
    signer_kind: 'delegation_toolkit',
    metadata: {
      delegation_manager: '0x1111111111111111111111111111111111111111',
      signed_delegation_count: 1,
    },
  };
}

function createOnboardingBootstrap(suffix: string, walletAddress: `0x${string}`) {
  return {
    occurredAt: '2026-03-30T00:00:00.000Z',
    rootedWalletContext: {
      rooted_wallet_context_id: `rwc-wallet-accounting-${suffix}`,
      user_id: `user-wallet-accounting-${suffix}`,
      wallet_address: walletAddress,
      network: 'arbitrum',
      registered_at: '2026-03-30T00:00:00.000Z',
      metadata: {
        source: 'onboarding_scan',
      },
    },
    mandates: [
      {
        mandate_ref: `mandate-portfolio-manager-${suffix}`,
        agent_id: 'portfolio-manager',
        mandate_summary: 'activate portfolio manager reserves',
        managed_onboarding: null,
      },
      {
        mandate_ref: `mandate-ember-lending-${suffix}`,
        agent_id: 'ember-lending',
        mandate_summary: 'lend USDC through the managed lending lane',
        managed_onboarding: {
          root_asset: 'USDC',
          benchmark_asset: 'USD',
          allocation_mode: 'allocable_idle',
          intent: 'deploy',
          control_path: 'lending.supply',
        },
      },
    ],
    userReservePolicies: [],
    activation: {
      mandateRef: `mandate-ember-lending-${suffix}`,
    },
  };
}

describeSharedEmberIntegration('wallet accounting tool Shared Ember integration', () => {
  let target: StartedSharedEmberTarget;

  beforeAll(async () => {
    target = await resolveSharedEmberTarget();
  });

  afterAll(async () => {
    await target?.close();
  });

  it('reads wallet assets and reservations from the real onboarding-state query', async () => {
    const suffix = Date.now().toString(36);
    const walletAddress = createUniqueWalletAddress(Date.now());
    const protocolHost = createPortfolioManagerSharedEmberHttpHost({
      baseUrl: target.baseUrl,
    });
    const domain = createPortfolioManagerDomain({
      protocolHost,
      agentId: 'portfolio-manager',
    });
    const tool = createPortfolioManagerWalletAccountingTool({
      protocolHost,
      agentId: 'ember-lending',
    });

    await expect(
      domain.handleOperation?.({
        threadId: `thread-wallet-accounting-${suffix}`,
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
          source: 'tool',
          name: 'complete_rooted_bootstrap_from_user_signing',
          input: {
            idempotencyKey: `idem-wallet-accounting-${suffix}`,
            onboarding: createOnboardingBootstrap(suffix, walletAddress),
            handoff: createRootDelegationHandoff(suffix, walletAddress),
          },
        },
      }),
    ).resolves.toMatchObject({
      state: {
        phase: 'onboarding',
      },
    });

    await expect(
      tool.execute?.('tool-wallet-accounting-int', {
        walletAddress,
      }),
    ).resolves.toMatchObject({
      content: [
        {
          type: 'text',
          text: expect.stringContaining('10 USDC'),
        },
      ],
      details: {
        wallet: {
          address: walletAddress,
          network: 'arbitrum',
        },
        onboarding: {
          phase: 'active',
          active: true,
        },
        assets: [
          expect.objectContaining({
            asset: 'USDC',
            quantity: '10',
            controlPath: 'lending.supply',
          }),
        ],
        reservations: [
          expect.objectContaining({
            agentId: 'ember-lending',
            controlPath: 'lending.supply',
          }),
        ],
      },
    });
  });
});
