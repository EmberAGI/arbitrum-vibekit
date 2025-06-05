import { nanoid } from 'nanoid';
import type { TokenInfo, FindTokenResult } from './types.js';
import * as allChains from 'viem/chains';
import type { Chain } from 'viem/chains';

// Helper to create a Task ID
export function createTaskId(): string {
  return nanoid();
}

// Helper function to find token info
export function findTokenInfo(
  tokenMap: Record<string, Array<TokenInfo>>,
  tokenName: string
): FindTokenResult {
  const upperTokenName = tokenName.toUpperCase();
  const possibleTokens = tokenMap[upperTokenName];

  if (!possibleTokens || possibleTokens.length === 0) {
    return { type: 'notFound' };
  }

  if (possibleTokens.length === 1) {
    return { type: 'found', token: possibleTokens[0]! };
  }

  return { type: 'clarificationNeeded', options: possibleTokens };
}

// Chain configuration for Viem and QuickNode
export interface ChainConfig {
  viemChain: Chain;
  quicknodeSegment: string;
}

// Records for QuickNode RPC URL segments based on chain ID
// Mainnet (1) has an empty segment as it's the base URL for quicknodeSubdomain.eth.quiknode.pro/
const quicknodeSegments: Record<string, string> = {
  '1': '', // Ethereum Mainnet
  '10': 'optimism', // Optimism Mainnet
  '137': 'matic', // Polygon Mainnet
  '8453': 'base-mainnet', // Base Mainnet
  '42161': 'arbitrum-mainnet', // Arbitrum One
  // Add other supported chains here e.g.
  // '5': 'goerli',
  // '11155111': 'sepolia',
  // '421613': 'arbitrum-goerli',
  // '84531': 'base-goerli',
  // '10200': 'chiado', // Gnosis Chiado Testnet
};

/**
 * Retrieves Viem chain object and QuickNode segment for a given chain ID.
 * @param chainId The chain ID as a string.
 * @returns ChainConfig object containing viemChain and quicknodeSegment.
 * @throws Error if chainId is invalid, not supported by Viem, or not configured in quicknodeSegments.
 */
export function getChainConfigById(chainId: string): ChainConfig {
  const numericChainId = parseInt(chainId, 10);
  if (isNaN(numericChainId)) {
    throw new Error(`Invalid chainId format: ${chainId}. Must be a number string.`);
  }

  let viemChain: Chain | undefined = undefined;
  for (const key in allChains) {
    const potentialChain = (allChains as any)[key] as Chain;
    if (
      potentialChain &&
      typeof potentialChain === 'object' &&
      potentialChain.id === numericChainId
    ) {
      viemChain = potentialChain;
      break;
    }
  }

  if (!viemChain) {
    throw new Error(
      `Unsupported chainId: ${chainId}. Viem chain definition not found. Ensure 'viem/chains' includes it or it's custom-defined.`
    );
  }

  const quicknodeSegment = quicknodeSegments[chainId];
  if (quicknodeSegment === undefined) {
    throw new Error(
      `Unsupported chainId: ${chainId} for QuickNode. Segment not configured in quicknodeSegments map.`
    );
  }

  return { viemChain, quicknodeSegment };
}
