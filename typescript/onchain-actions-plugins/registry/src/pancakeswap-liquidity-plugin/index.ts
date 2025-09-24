import type { ActionDefinition, EmberPlugin, LiquidityActions } from '../core/index.js';
import { PancakeSwapLiquidityAdapter, type PancakeSwapLiquidityAdapterParams } from './adapter.js';
import type { ChainConfig } from '../chainConfig.js';
import type { PublicEmberPluginRegistry } from '../registry.js';

/**
 * Get the PancakeSwap Ember liquidity plugin.
 * @param params - Configuration parameters for the PancakeSwapLiquidityAdapter, including chainId and rpcUrl.
 * @returns The PancakeSwap Ember liquidity plugin.
 */
export async function getPancakeSwapLiquidityPlugin(
  params: PancakeSwapLiquidityAdapterParams
): Promise<EmberPlugin<'liquidity'>> {
  const adapter = new PancakeSwapLiquidityAdapter(params);

  return {
    id: `PANCAKESWAP_LIQUIDITY_CHAIN_${params.chainId}`,
    type: 'liquidity',
    name: `PancakeSwap liquidity for ${params.chainId}`,
    description: 'PancakeSwap DEX liquidity provision on Arbitrum',
    website: 'https://pancakeswap.finance',
    x: 'https://x.com/pancakeswap',
    actions: await getPancakeSwapLiquidityActions(adapter),
    queries: {
      getWalletPositions: adapter.getWalletLiquidityPositions.bind(adapter),
      getPools: adapter.getLiquidityPools.bind(adapter),
    },
  };
}

/**
 * Get the PancakeSwap liquidity actions.
 * @param adapter - An instance of PancakeSwapLiquidityAdapter to interact with PancakeSwap.
 * @returns An array of action definitions for PancakeSwap liquidity operations.
 */
export async function getPancakeSwapLiquidityActions(
  adapter: PancakeSwapLiquidityAdapter
): Promise<ActionDefinition<LiquidityActions>[]> {
  // Get common tokens for this chain
  const commonTokens = await adapter.getCommonTokens();

  return [
    {
      type: 'liquidity-supply',
      name: `PancakeSwap add liquidity in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: commonTokens,
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: commonTokens, // LP tokens are represented by the underlying tokens
          },
        ]),
      callback: adapter.createSupplyLiquidityTransaction.bind(adapter),
    },
    {
      type: 'liquidity-withdraw',
      name: `PancakeSwap remove liquidity in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: commonTokens, // LP tokens are represented by the underlying tokens
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: commonTokens,
          },
        ]),
      callback: adapter.createWithdrawLiquidityTransaction.bind(adapter),
    },
  ];
}

/**
 * Register the PancakeSwap liquidity plugin for the specified chain configuration.
 * @param chainConfig - The chain configuration to check for PancakeSwap support.
 * @param registry - The public Ember plugin registry to register the plugin with.
 */
export function registerPancakeSwapLiquidity(
  chainConfig: ChainConfig,
  registry: PublicEmberPluginRegistry
) {
  const supportedChains = [42161]; // Arbitrum One
  if (!supportedChains.includes(chainConfig.chainId)) {
    return;
  }

  registry.registerDeferredPlugin(
    getPancakeSwapLiquidityPlugin({
      chainId: chainConfig.chainId,
      rpcUrl: chainConfig.rpcUrl,
      wrappedNativeToken: chainConfig.wrappedNativeToken,
    })
  );
}
