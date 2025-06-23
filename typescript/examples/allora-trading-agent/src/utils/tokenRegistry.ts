/**
 * Token Registry - Maps token symbols to addresses across chains
 * Supports major tokens on Arbitrum, Ethereum, Base, Optimism, and Polygon
 */

export interface TokenInfo {
  address: string;
  decimals: number;
}

export interface ChainTokenMap {
  [chainId: string]: TokenInfo;
}

export interface TokenRegistry {
  [symbol: string]: ChainTokenMap;
}

// Supported chain IDs
export const SUPPORTED_CHAINS = {
  ARBITRUM: '42161',
  ETHEREUM: '1',
  BASE: '8453',
  OPTIMISM: '10',
  POLYGON: '137',
} as const;

export type SupportedChainId = (typeof SUPPORTED_CHAINS)[keyof typeof SUPPORTED_CHAINS];

// Token registry with addresses across supported chains
export const TOKEN_REGISTRY: TokenRegistry = {
  // Bitcoin (Wrapped)
  BTC: {
    [SUPPORTED_CHAINS.ARBITRUM]: {
      address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      decimals: 8,
    },
    [SUPPORTED_CHAINS.ETHEREUM]: {
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      decimals: 8,
    },
    [SUPPORTED_CHAINS.BASE]: {
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC bridged
      decimals: 8,
    },
    [SUPPORTED_CHAINS.OPTIMISM]: {
      address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
      decimals: 8,
    },
    [SUPPORTED_CHAINS.POLYGON]: {
      address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
      decimals: 8,
    },
  },
  WBTC: {
    // Same as BTC
    [SUPPORTED_CHAINS.ARBITRUM]: {
      address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      decimals: 8,
    },
    [SUPPORTED_CHAINS.ETHEREUM]: {
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      decimals: 8,
    },
    [SUPPORTED_CHAINS.BASE]: {
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      decimals: 8,
    },
    [SUPPORTED_CHAINS.OPTIMISM]: {
      address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
      decimals: 8,
    },
    [SUPPORTED_CHAINS.POLYGON]: {
      address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
      decimals: 8,
    },
  },
  // Ethereum (Wrapped)
  ETH: {
    [SUPPORTED_CHAINS.ARBITRUM]: {
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      decimals: 18,
    },
    [SUPPORTED_CHAINS.ETHEREUM]: {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
    },
    [SUPPORTED_CHAINS.BASE]: {
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
    },
    [SUPPORTED_CHAINS.OPTIMISM]: {
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
    },
    [SUPPORTED_CHAINS.POLYGON]: {
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      decimals: 18,
    },
  },
  WETH: {
    // Same as ETH
    [SUPPORTED_CHAINS.ARBITRUM]: {
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      decimals: 18,
    },
    [SUPPORTED_CHAINS.ETHEREUM]: {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
    },
    [SUPPORTED_CHAINS.BASE]: {
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
    },
    [SUPPORTED_CHAINS.OPTIMISM]: {
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
    },
    [SUPPORTED_CHAINS.POLYGON]: {
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      decimals: 18,
    },
  },
  // USD Coin
  USDC: {
    [SUPPORTED_CHAINS.ARBITRUM]: {
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
    },
    [SUPPORTED_CHAINS.ETHEREUM]: {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    },
    [SUPPORTED_CHAINS.BASE]: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
    },
    [SUPPORTED_CHAINS.OPTIMISM]: {
      address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      decimals: 6,
    },
    [SUPPORTED_CHAINS.POLYGON]: {
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      decimals: 6,
    },
  },
  // Arbitrum token (only on Arbitrum)
  ARB: {
    [SUPPORTED_CHAINS.ARBITRUM]: {
      address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      decimals: 18,
    },
  },
  // DAI Stablecoin
  DAI: {
    [SUPPORTED_CHAINS.ARBITRUM]: {
      address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      decimals: 18,
    },
    [SUPPORTED_CHAINS.ETHEREUM]: {
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      decimals: 18,
    },
    [SUPPORTED_CHAINS.BASE]: {
      address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      decimals: 18,
    },
    [SUPPORTED_CHAINS.OPTIMISM]: {
      address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      decimals: 18,
    },
    [SUPPORTED_CHAINS.POLYGON]: {
      address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      decimals: 18,
    },
  },
  // Tether USD
  USDT: {
    [SUPPORTED_CHAINS.ARBITRUM]: {
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      decimals: 6,
    },
    [SUPPORTED_CHAINS.ETHEREUM]: {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
    },
    [SUPPORTED_CHAINS.BASE]: {
      address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      decimals: 6,
    },
    [SUPPORTED_CHAINS.OPTIMISM]: {
      address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      decimals: 6,
    },
    [SUPPORTED_CHAINS.POLYGON]: {
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      decimals: 6,
    },
  },
};

// Helper function to get token info
export function getTokenInfo(symbol: string, chainId: string): TokenInfo | null {
  const tokenData = TOKEN_REGISTRY[symbol.toUpperCase()];
  if (!tokenData) return null;

  return tokenData[chainId] || null;
}

// Helper function to check if a token is supported on a chain
export function isTokenSupported(symbol: string, chainId: string): boolean {
  return getTokenInfo(symbol, chainId) !== null;
}

// Helper function to get all supported tokens for a chain
export function getSupportedTokensForChain(chainId: string): string[] {
  const tokens: string[] = [];

  for (const [symbol, chainMap] of Object.entries(TOKEN_REGISTRY)) {
    if (chainMap[chainId]) {
      tokens.push(symbol);
    }
  }

  return tokens;
}

// Helper function to get chain name from ID
export function getChainName(chainId: string): string {
  const chainNames: Record<string, string> = {
    [SUPPORTED_CHAINS.ARBITRUM]: 'Arbitrum',
    [SUPPORTED_CHAINS.ETHEREUM]: 'Ethereum',
    [SUPPORTED_CHAINS.BASE]: 'Base',
    [SUPPORTED_CHAINS.OPTIMISM]: 'Optimism',
    [SUPPORTED_CHAINS.POLYGON]: 'Polygon',
  };

  return chainNames[chainId] || `Chain ${chainId}`;
}
