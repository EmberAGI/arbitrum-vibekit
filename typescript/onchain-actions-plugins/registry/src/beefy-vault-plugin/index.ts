import type { ActionDefinition, EmberPlugin, VaultActions, VaultQueries } from '../core/index.js';
import type {
  VaultDepositParams,
  VaultWithdrawParams,
  VaultDepositResponse,
  VaultWithdrawResponse,
} from '../core/actions/vaults.js';
import { BeefyAdapter } from './adapter.js';
import { ethers } from 'ethers';
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
interface BeefyQueries extends VaultQueries {
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
): Promise<EmberPlugin<'vaults'>> {
  const adapter = new BeefyAdapter(params);

  return {
    id: `BEEFY_VAULT_CHAIN_${params.chainId}`,
    type: 'vaults',
    name: `Beefy Vaults for ${params.chainId}`,
    description: 'Beefy Finance yield optimization vaults',
    website: 'https://beefy.finance',
    x: 'https://x.com/beefyfinance',
    actions: await getBeefyVaultActions(adapter),
    queries: {
      getVaults: adapter.getVaults.bind(adapter),
      getVaultPerformance: async () => ({
        performance: { vaultId: '', apy: 0, tvl: 0, pricePerFullShare: '1' },
      }),
      getUserVaultPositions: async () => ({ positions: [] }),
      getVaultStrategies: async () => ({ strategies: [] }),
      getVaultBoosts: async () => ({ boosts: [] }),
      getApyData: adapter.getApyData.bind(adapter),
      getTvlData: adapter.getTvlData.bind(adapter),
      getApyBreakdownData: adapter.getApyBreakdownData.bind(adapter),
      getFeesData: adapter.getFeesData.bind(adapter),
    } as BeefyQueries,
  };
}

/**
 * Get the Beefy Vault actions for the vault protocol.
 * @param adapter - An instance of BeefyAdapter to interact with Beefy vaults.
 * @returns An array of action definitions for Beefy vault operations.
 */
export async function getBeefyVaultActions(
  adapter: BeefyAdapter
): Promise<ActionDefinition<VaultActions>[]> {
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

  const actions: ActionDefinition<VaultActions>[] = [
    // Deposit underlying tokens to Beefy vaults to get mooTokens
    {
      type: 'vault-deposit' as const,
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
      callback: async (params: VaultDepositParams): Promise<VaultDepositResponse> => {
        // Convert vault deposit params to adapter's expected format
        const response = await adapter.createSupplyTransaction({
          supplyToken: {
            symbol: params.tokenAddress.split('/').pop() || '',
            name: params.tokenAddress.split('/').pop() || '',
            tokenUid: { chainId: adapter.chain.id.toString(), address: params.tokenAddress },
            isNative: false,
            decimals: 18,
            isVetted: true,
          },
          amount: BigInt(params.amount),
          walletAddress: params.walletAddress,
        });

        // Convert TransactionPlan to PopulatedTransaction format
        const transactions = response.transactions.map(tx => ({
          to: tx.to,
          data: tx.data,
          value: ethers.BigNumber.from(tx.value),
        }));

        return {
          vaultId: params.vaultId,
          tokenAddress: params.tokenAddress,
          amount: params.amount,
          expectedVaultShares: '0', // Would need calculation
          transactions,
          chainId: adapter.chain.id.toString(),
        };
      },
    },

    // Withdraw from Beefy vaults by redeeming mooTokens for underlying tokens
    {
      type: 'vault-withdraw' as const,
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
      callback: async (params: VaultWithdrawParams): Promise<VaultWithdrawResponse> => {
        // Convert vault withdraw params to adapter's expected format
        const response = await adapter.createWithdrawTransaction({
          tokenToWithdraw: {
            symbol: params.vaultSharesAddress.split('/').pop() || '',
            name: params.vaultSharesAddress.split('/').pop() || '',
            tokenUid: { chainId: adapter.chain.id.toString(), address: params.vaultSharesAddress },
            isNative: false,
            decimals: 18,
            isVetted: true,
          },
          amount: BigInt(params.amount),
          walletAddress: params.walletAddress,
        });

        // Convert TransactionPlan to PopulatedTransaction format
        const transactions = response.transactions.map(tx => ({
          to: tx.to,
          data: tx.data,
          value: ethers.BigNumber.from(tx.value),
        }));

        return {
          vaultId: params.vaultId,
          vaultSharesAddress: params.vaultSharesAddress,
          amount: params.amount,
          expectedTokens: '0', // Would need calculation
          transactions,
          chainId: adapter.chain.id.toString(),
        };
      },
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
