import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type StartedSharedEmberTarget = {
  baseUrl: string;
  close: () => Promise<void>;
};

const DEFAULT_MANAGED_AGENT_ID = 'ember-lending';
const DEFAULT_MANAGED_AGENT_WALLET =
  '0x00000000000000000000000000000000000000c1' as const;
const DEFAULT_BENCHMARK_ASSET = 'USD';
const DEFAULT_OBSERVED_ASSET = 'USDC';
const DEFAULT_OBSERVED_QUANTITY = '10';
const DEFAULT_DELEGATION_ISSUED_AT = '2026-03-29T00:01:00Z';
const DEFAULT_DELEGATION_ACTIVATED_AT = '2026-03-29T00:01:05Z';
const DEFAULT_IDENTITY_REGISTERED_AT = '2026-03-29T00:00:30Z';

type ResolveSharedEmberTargetOptions = {
  managedAgentId?: string;
  managedAgentWalletAddress?: `0x${string}`;
  observedAsset?: string;
  observedQuantity?: string;
  benchmarkAsset?: string;
};

function resolveChainId(network: string): string {
  switch (network) {
    case 'arbitrum':
      return '42161';
    default:
      return '1';
  }
}

function createWalletObservationSource(input: {
  observedAsset: string;
  observedQuantity: string;
  benchmarkAsset: string;
}) {
  return {
    async observeWallet(params: {
      walletAddress: string;
      network: string;
      observedAt: string;
    }) {
      return {
        observation_id: `wallet-obs-${params.network}-${params.walletAddress.toLowerCase()}`,
        wallet_address: params.walletAddress,
        network: params.network,
        observed_at: params.observedAt,
        benchmark_asset: input.benchmarkAsset,
        balances: [
          {
            observation_family: 'wallet_balance' as const,
            adapter_route: 'spot_wallet_balance' as const,
            token: {
              chain_id: resolveChainId(params.network),
              address: `0x${input.observedAsset}${params.network.toUpperCase()}`,
              symbol: input.observedAsset,
              decimals: 6,
            },
            quantity: input.observedQuantity,
            benchmark_value: input.observedQuantity,
            metadata: {},
          },
        ],
        positions: [],
      };
    },
  };
}

function createManagedOnboardingIssuerFixture(input: { managedAgentId: string }) {
  return {
    [input.managedAgentId]: {
      async issueDelegation(params: { requestId: string }) {
        const issuanceId = `${input.managedAgentId}-${params.requestId}`;
        return {
          delegationId: `del-${issuanceId}`,
          artifactRef: `artifact-${issuanceId}`,
          issuedAt: DEFAULT_DELEGATION_ISSUED_AT,
          activatedAt: DEFAULT_DELEGATION_ACTIVATED_AT,
          policyHash: `hash-${issuanceId}`,
        };
      },
    },
  };
}

function createManagedSubagentIdentity(input: {
  managedAgentId: string;
  managedAgentWalletAddress: `0x${string}`;
}) {
  return {
    identity_ref: `agent-identity-${input.managedAgentId}-protocol-001`,
    agent_id: input.managedAgentId,
    role: 'subagent' as const,
    wallet_address: input.managedAgentWalletAddress,
    wallet_source: 'ember_local_write',
    capability_metadata: {
      execution: true,
      onboarding: true,
    },
    registration_version: 1,
    registered_at: DEFAULT_IDENTITY_REGISTERED_AT,
  };
}

export async function resolveSharedEmberTarget(
  options: ResolveSharedEmberTargetOptions = {},
): Promise<StartedSharedEmberTarget> {
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
    startRepoLocalSharedEmberDomainProtocolHttpServer: (input?: {
      bootstrap?: unknown;
    }) => Promise<StartedSharedEmberTarget>;
  };

  const managedAgentId = options.managedAgentId ?? DEFAULT_MANAGED_AGENT_ID;
  const managedAgentWalletAddress =
    options.managedAgentWalletAddress ?? DEFAULT_MANAGED_AGENT_WALLET;

  return harnessModule.startRepoLocalSharedEmberDomainProtocolHttpServer({
    bootstrap: {
      initialState: {
        agent_service_identities: [
          createManagedSubagentIdentity({
            managedAgentId,
            managedAgentWalletAddress,
          }),
        ],
      },
      walletObservationSource: createWalletObservationSource({
        observedAsset: options.observedAsset ?? DEFAULT_OBSERVED_ASSET,
        observedQuantity: options.observedQuantity ?? DEFAULT_OBSERVED_QUANTITY,
        benchmarkAsset: options.benchmarkAsset ?? DEFAULT_BENCHMARK_ASSET,
      }),
      managedOnboardingIssuers: createManagedOnboardingIssuerFixture({
        managedAgentId,
      }),
    },
  });
}
