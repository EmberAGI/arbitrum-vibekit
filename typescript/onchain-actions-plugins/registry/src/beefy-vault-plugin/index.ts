import type {
  ActionDefinition,
  EmberPlugin,
  LendingActions,
  LendingQueries,
} from '../core/index.js';
import { BeefyAdapter } from './adapter.js';
import type {
  BeefyAdapterParams,
  GetVaultsRequest,
  GetVaultsResponse,
  GetApyRequest,
  GetApyResponse,
  GetTvlRequest,
  GetTvlResponse,
  GetApyBreakdownRequest,
  GetApyBreakdownResponse,
  GetFeesRequest,
  GetFeesResponse,
} from './types.js';
import type { ChainConfig } from '../chainConfig.js';
import type { PublicEmberPluginRegistry } from '../registry.js';

// Extended queries interface for Beefy plugin
interface BeefyQueries extends LendingQueries {
  getVaults: (params: GetVaultsRequest) => Promise<GetVaultsResponse>;
  getApyData: (params: GetApyRequest) => Promise<GetApyResponse>;
  getTvlData: (params: GetTvlRequest) => Promise<GetTvlResponse>;
  getApyBreakdownData: (params: GetApyBreakdownRequest) => Promise<GetApyBreakdownResponse>;
  getFeesData: (params: GetFeesRequest) => Promise<GetFeesResponse>;
}

/**
 * Get the Beefy Vault Ember plugin.
 * @param params - Configuration parameters for the BeefyAdapter, including chainId and rpcUrl.
 * @returns The Beefy Vault Ember plugin.
 */
export async function getBeefyVaultEmberPlugin(
  params: BeefyAdapterParams
): Promise<EmberPlugin<'lending'>> {
  const adapter = new BeefyAdapter(params);

  return {
    id: `BEEFY_VAULT_CHAIN_${params.chainId}`,
    type: 'lending',
    name: `Beefy Vaults for ${params.chainId}`,
    description: 'Beefy Finance yield optimization vaults',
    website: 'https://beefy.finance',
    x: 'https://x.com/beefyfinance',
    actions: await getBeefyVaultActions(adapter),
    queries: {
      getPositions: adapter.getUserSummary.bind(adapter),
      getAvailableVaults: adapter.getAvailableVaults.bind(adapter),
      getVaults: adapter.getVaults.bind(adapter),
      getApyData: adapter.getApyData.bind(adapter),
      getTvlData: adapter.getTvlData.bind(adapter),
      getApyBreakdownData: adapter.getApyBreakdownData.bind(adapter),
      getFeesData: adapter.getFeesData.bind(adapter),
    } as BeefyQueries,
  };
}

/**
 * Get the Beefy Vault actions for the lending protocol.
 * @param adapter - An instance of BeefyAdapter to interact with Beefy vaults.
 * @returns An array of action definitions for Beefy vault operations.
 */
export async function getBeefyVaultActions(
  adapter: BeefyAdapter
): Promise<ActionDefinition<LendingActions>[]> {
  const vaults = await adapter.getActiveVaults();

  // Extract unique underlying tokens and mooTokens
  const underlyingTokens: string[] = [];
  const mooTokens: string[] = [];

  for (const vault of vaults) {
    if (!underlyingTokens.includes(vault.tokenAddress.toLowerCase())) {
      underlyingTokens.push(vault.tokenAddress.toLowerCase());
    }
    if (!mooTokens.includes(vault.mooTokenAddress.toLowerCase())) {
      mooTokens.push(vault.mooTokenAddress.toLowerCase());
    }
  }

  const actions: ActionDefinition<LendingActions>[] = [
    // Supply underlying tokens to Beefy vaults to get mooTokens
    {
      type: 'lending-supply' as const,
      name: `Beefy vault deposits in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: underlyingTokens,
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: mooTokens,
          },
        ]),
      callback: adapter.createSupplyTransaction.bind(adapter),
    },

    // Withdraw from Beefy vaults by redeeming mooTokens for underlying tokens
    {
      type: 'lending-withdraw' as const,
      name: `Beefy vault withdrawals in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: mooTokens,
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: underlyingTokens,
          },
        ]),
      callback: adapter.createWithdrawTransaction.bind(adapter),
    },
  ];

  return actions;
}

/**
 * Register the Beefy Vault plugin for the specified chain configuration.
 * @param chainConfig - The chain configuration to check for Beefy support.
 * @param registry - The public Ember plugin registry to register the plugin with.
 * @returns A promise that resolves when the plugin is registered.
 */
export function registerBeefyVault(chainConfig: ChainConfig, registry: PublicEmberPluginRegistry) {
  // Focus on Arbitrum for now, but can be expanded
  const supportedChains = [42161]; // Arbitrum
  if (!supportedChains.includes(chainConfig.chainId)) {
    return;
  }

  registry.registerDeferredPlugin(
    getBeefyVaultEmberPlugin({
      chainId: chainConfig.chainId,
      rpcUrl: chainConfig.rpcUrl,
      wrappedNativeToken: chainConfig.wrappedNativeToken,
    })
  );
}
