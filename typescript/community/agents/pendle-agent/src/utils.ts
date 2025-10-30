import type { Chain } from 'viem/chains';
import { mainnet, arbitrum, optimism, polygon, base } from 'viem/chains';

export function logError(...args: unknown[]) {
  console.error(...args);
}

export interface ChainConfig {
  viemChain: Chain;
  quicknodeSegment: string;
}

export const chainIdMap: Record<string, ChainConfig> = {
  '1': { viemChain: mainnet, quicknodeSegment: '' },
  '42161': { viemChain: arbitrum, quicknodeSegment: 'arbitrum-mainnet' },
  '10': { viemChain: optimism, quicknodeSegment: 'optimism' },
  '137': { viemChain: polygon, quicknodeSegment: 'matic' },
  '8453': { viemChain: base, quicknodeSegment: 'base-mainnet' },
};

export function getChainConfigById(chainId: string): ChainConfig {
  const config = chainIdMap[chainId];
  if (!config) {
    throw new Error(`Unsupported chainId: ${chainId}. Please update chainIdMap.`);
  }
  return config;
}
