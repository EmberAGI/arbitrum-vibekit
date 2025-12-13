import { providers } from 'ethers';
import type { ChainId } from '../schemas/index.js';
import { getRpcUrl } from './chain-config.js';

/**
 * Provider cache to avoid creating multiple providers for the same chain
 */
const providerCache = new Map<ChainId, providers.JsonRpcProvider>();

/**
 * Get or create a provider for a given chain ID
 */
export function getProvider(chainId: ChainId): providers.JsonRpcProvider {
  const cached = providerCache.get(chainId);
  if (cached) {
    return cached;
  }

  const rpcUrl = getRpcUrl(chainId);
  const provider = new providers.JsonRpcProvider(rpcUrl);
  providerCache.set(chainId, provider);
  return provider;
}

