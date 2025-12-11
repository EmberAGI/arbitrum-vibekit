import { CompoundV3MarketsByChain, type CompoundAddresses } from './address-book.js';

// Compound V3 market selection provided by address-book.ts
// An interface that only contains fields of market definitions that we actually use
export type CompoundMarket = {
  COMET: string;
};

/**
 * Get a specific Compound V3 market for a given chain
 * @param chainId - The chain ID (1 for Ethereum, 42161 for Arbitrum, etc.)
 * @param marketId - The market identifier (e.g., 'USDC', 'WETH', 'USDT', 'WSTETH', 'USDS' for mainnet; 'USDCE', 'USDC', 'WETH', 'USDT' for Arbitrum; 'USDC', 'USDBC', 'WETH', 'AERO' for Base)
 * @returns The market configuration
 */
export const getMarket = (chainId: number, marketId: string): CompoundMarket => {
  const chainMarkets = CompoundV3MarketsByChain[chainId];
  if (!chainMarkets) {
    throw new Error(
      `Compound: no markets found for chain ID ${chainId}: modify compound-lending-plugin/address-book.ts`,
    );
  }

  const market = chainMarkets[marketId];
  if (!market) {
    const availableMarkets = Object.keys(chainMarkets).join(', ');
    throw new Error(
      `Compound: market '${marketId}' not found for chain ID ${chainId}. Available markets: ${availableMarkets}`,
    );
  }

  return market as CompoundMarket;
};

/**
 * Get all available markets for a given chain
 * @param chainId - The chain ID
 * @returns A record of market identifiers to market configurations
 */
export const getMarketsForChain = (chainId: number): Record<string, CompoundAddresses> => {
  const chainMarkets = CompoundV3MarketsByChain[chainId];
  if (!chainMarkets) {
    throw new Error(
      `Compound: no markets found for chain ID ${chainId}: modify compound-lending-plugin/address-book.ts`,
    );
  }

  return chainMarkets;
};
