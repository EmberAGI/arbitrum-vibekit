import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPortfolioManagerDomain } from './sharedEmberAdapter.js';
import { createPortfolioManagerSharedEmberHttpHost } from './sharedEmberHttpHost.js';
import { createPortfolioManagerWalletAccountingTool } from './walletAccountingTool.js';

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
        mandate_ref: `mandate-wallet-accounting-${suffix}`,
        agent_id: 'portfolio-manager',
        mandate_summary: 'activate portfolio manager reserves',
      },
    ],
    capitalObservation: {
      observation_id: `observation-wallet-accounting-${suffix}`,
      kind: 'onboarding_scan',
      wallet_address: walletAddress,
      network: 'arbitrum',
      observed_at: '2026-03-30T00:00:00.000Z',
      benchmark_asset: 'USD',
      valuation_ref: `valuation-wallet-accounting-${suffix}`,
      asset_deltas: [{ root_asset: 'USDC', quantity_delta: '10' }],
      affected_unit_ids: [`unit-wallet-accounting-${suffix}`],
    },
    userReservePolicies: [
      {
        reserve_policy_ref: `reserve-policy-wallet-accounting-${suffix}`,
        summary: 'reserve 10 USDC for portfolio manager',
        user_reserve_rules: [
          {
            root_asset: 'USDC',
            network: 'arbitrum',
            benchmark_asset: 'USD',
            reserved_quantity: '10',
            reason: 'portfolio manager bootstrap reserve',
          },
        ],
      },
    ],
    ownedUnits: [
      {
        unit_id: `unit-wallet-accounting-${suffix}`,
        root_asset: 'USDC',
        network: 'arbitrum',
        wallet_address: walletAddress,
        quantity: '10',
        owner_type: 'user_idle',
        owner_id: `user-wallet-accounting-${suffix}`,
        status: 'reserved',
        reservation_id: `reservation-wallet-accounting-${suffix}`,
        delegation_id: null,
        control_path: 'unassigned',
        position_kind: 'unassigned',
        benchmark_asset: 'USD',
        benchmark_value: '10',
        valuation_ref: `valuation-wallet-accounting-${suffix}`,
        cost_basis: '10',
        opened_at: '2026-03-30T00:00:00.000Z',
        closed_at: null,
        parent_unit_ids: [],
        metadata: {
          source: 'onboarding_scan',
        },
      },
    ],
    reservations: [
      {
        reservation_id: `reservation-wallet-accounting-${suffix}`,
        agent_id: 'portfolio-manager',
        owner_id: `user-wallet-accounting-${suffix}`,
        purpose: 'deploy',
        control_path: 'unassigned',
        unit_allocations: [{ unit_id: `unit-wallet-accounting-${suffix}`, quantity: '10' }],
        status: 'active',
        created_at: '2026-03-30T00:00:00.000Z',
        released_at: null,
        superseded_by: null,
      },
    ],
    policySnapshots: [
      {
        policy_snapshot_ref: `policy-wallet-accounting-${suffix}`,
        agent_id: 'portfolio-manager',
        network: 'arbitrum',
        control_paths: ['unassigned'],
        unit_bounds: [{ unit_id: `unit-wallet-accounting-${suffix}`, quantity: '10' }],
        created_at: '2026-03-30T00:00:00.000Z',
      },
    ],
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
      agentId: 'portfolio-manager',
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
            controlPath: 'unassigned',
          }),
        ],
        reservations: [
          expect.objectContaining({
            agentId: 'portfolio-manager',
            controlPath: 'unassigned',
          }),
        ],
      },
    });
  });
});
