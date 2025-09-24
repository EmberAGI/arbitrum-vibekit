import type { ActionDefinition, EmberPlugin, SwapActions } from '../core/index.js';
import { PancakeSwapAdapter, type PancakeSwapAdapterParams } from './adapter.js';
import type { ChainConfig } from '../chainConfig.js';
import type { PublicEmberPluginRegistry } from '../registry.js';

/**
 * Get the PancakeSwap Ember swap plugin.
 * @param params - Configuration parameters for the PancakeSwapAdapter, including chainId and rpcUrl.
 * @returns The PancakeSwap Ember swap plugin.
 */
export async function getPancakeSwapSwapPlugin(
  params: PancakeSwapAdapterParams
): Promise<EmberPlugin<'swap'>> {
  const adapter = new PancakeSwapAdapter(params);

  return {
    id: `PANCAKESWAP_SWAP_CHAIN_${params.chainId}`,
    type: 'swap',
    name: `PancakeSwap token swap for ${params.chainId}`,
    description: 'PancakeSwap DEX token swapping on Arbitrum',
    website: 'https://pancakeswap.finance',
    x: 'https://x.com/pancakeswap',
    actions: await getPancakeSwapSwapActions(adapter),
    queries: {},
  };
}

/**
 * Get the PancakeSwap swap actions.
 * @param adapter - An instance of PancakeSwapAdapter to interact with PancakeSwap.
 * @returns An array of action definitions for PancakeSwap token swapping.
 */
export async function getPancakeSwapSwapActions(
  adapter: PancakeSwapAdapter
): Promise<ActionDefinition<SwapActions>[]> {
  // Get common tokens for this chain
  const commonTokens = await adapter.getCommonTokens();

  return [
    {
      type: 'swap',
      name: `PancakeSwap token swap in chain ${adapter.chain.id}`,
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
            tokens: commonTokens,
          },
        ]),
      callback: adapter.createSwapTransaction.bind(adapter),
    },
  ];
}

/**
 * Register the PancakeSwap swap plugin for the specified chain configuration.
 * @param chainConfig - The chain configuration to check for PancakeSwap support.
 * @param registry - The public Ember plugin registry to register the plugin with.
 */
export function registerPancakeSwapSwap(
  chainConfig: ChainConfig,
  registry: PublicEmberPluginRegistry
) {
  const supportedChains = [42161]; // Arbitrum One
  if (!supportedChains.includes(chainConfig.chainId)) {
    return;
  }

  registry.registerDeferredPlugin(
    getPancakeSwapSwapPlugin({
      chainId: chainConfig.chainId,
      rpcUrl: chainConfig.rpcUrl,
      wrappedNativeToken: chainConfig.wrappedNativeToken,
    })
  );
}
