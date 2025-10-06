/**
 * Token utility functions for getting token metadata
 */

import { createPublicClient, type Address } from 'viem';

const erc20Abi = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
] as const;

/**
 * Get token decimals from contract
 */
export async function getTokenDecimals(
  tokenAddress: string,
  publicClient: ReturnType<typeof createPublicClient>
): Promise<number> {
  try {
    const decimals = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: 'decimals',
    });
    return Number(decimals);
  } catch (error) {
    console.warn(`Failed to get decimals for token ${tokenAddress}:`, error);
    // Default to 18 decimals if we can't fetch
    return 18;
  }
}

/**
 * Get token symbol from contract
 */
export async function getTokenSymbol(
  tokenAddress: string,
  publicClient: ReturnType<typeof createPublicClient>
): Promise<string> {
  try {
    const symbol = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: 'symbol',
    });
    return symbol as string;
  } catch (error) {
    console.warn(`Failed to get symbol for token ${tokenAddress}:`, error);
    return 'UNKNOWN';
  }
}
