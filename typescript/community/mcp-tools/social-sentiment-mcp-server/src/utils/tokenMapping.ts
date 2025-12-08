/**
 * Token mapping for better search queries
 * Maps token symbols to better search terms and related keywords
 */

export interface TokenInfo {
  symbol: string;
  name: string;
  searchTerms: string[]; // Terms to search for
  excludeTerms?: string[]; // Terms that indicate irrelevant posts
  subreddits?: string[]; // Specific subreddits to prioritize
}

export const TOKEN_MAPPINGS: Record<string, TokenInfo> = {
  ARB: {
    symbol: 'ARB',
    name: 'Arbitrum',
    searchTerms: ['ARB token', 'Arbitrum ARB', 'Arbitrum token', '$ARB'],
    excludeTerms: ['arbitrage', 'arb', 'arbitrary'],
    subreddits: ['ethereum', 'defi', 'Arbitrum'],
  },
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    searchTerms: ['ETH', 'Ethereum', '$ETH'],
    excludeTerms: [],
    subreddits: ['ethereum', 'CryptoCurrency', 'cryptocurrency'],
  },
  BTC: {
    symbol: 'BTC',
    name: 'Bitcoin',
    searchTerms: ['BTC', 'Bitcoin', '$BTC'],
    excludeTerms: [],
    subreddits: ['Bitcoin', 'CryptoCurrency', 'cryptocurrency'],
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    searchTerms: ['USDC', 'USD Coin', '$USDC'],
    excludeTerms: [],
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether',
    searchTerms: ['USDT', 'Tether', '$USDT'],
    excludeTerms: [],
  },
  DAI: {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    searchTerms: ['DAI', 'MakerDAO', '$DAI'],
    excludeTerms: [],
  },
  UNI: {
    symbol: 'UNI',
    name: 'Uniswap',
    searchTerms: ['UNI token', 'Uniswap UNI', '$UNI'],
    excludeTerms: [],
    subreddits: ['UniSwap', 'defi'],
  },
  AAVE: {
    symbol: 'AAVE',
    name: 'Aave',
    searchTerms: ['AAVE', 'Aave token', '$AAVE'],
    excludeTerms: [],
    subreddits: ['Aave_Official', 'defi'],
  },
  LINK: {
    symbol: 'LINK',
    name: 'Chainlink',
    searchTerms: ['LINK', 'Chainlink', '$LINK'],
    excludeTerms: [],
  },
  MATIC: {
    symbol: 'MATIC',
    name: 'Polygon',
    searchTerms: ['MATIC', 'Polygon MATIC', '$MATIC'],
    excludeTerms: [],
    subreddits: ['0xPolygon', 'defi'],
  },
  OP: {
    symbol: 'OP',
    name: 'Optimism',
    searchTerms: ['OP token', 'Optimism OP', '$OP'],
    excludeTerms: ['opinion', 'ops'],
    subreddits: ['optimismEthereum', 'defi'],
  },
  GMX: {
    symbol: 'GMX',
    name: 'GMX',
    searchTerms: ['GMX', 'GMX token', '$GMX'],
    excludeTerms: [],
    subreddits: ['GMX_Official', 'defi'],
  },
  CRV: {
    symbol: 'CRV',
    name: 'Curve',
    searchTerms: ['CRV', 'Curve CRV', '$CRV'],
    excludeTerms: [],
    subreddits: ['CurveFinance', 'defi'],
  },
  MKR: {
    symbol: 'MKR',
    name: 'Maker',
    searchTerms: ['MKR', 'Maker MKR', '$MKR'],
    excludeTerms: [],
    subreddits: ['MakerDAO', 'defi'],
  },
  SNX: {
    symbol: 'SNX',
    name: 'Synthetix',
    searchTerms: ['SNX', 'Synthetix SNX', '$SNX'],
    excludeTerms: [],
    subreddits: ['synthetix_io', 'defi'],
  },
  COMP: {
    symbol: 'COMP',
    name: 'Compound',
    searchTerms: ['COMP', 'Compound COMP', '$COMP'],
    excludeTerms: ['computer', 'company'],
    subreddits: ['Compound', 'defi'],
  },
};

/**
 * Get token info for a symbol
 */
export function getTokenInfo(symbol: string): TokenInfo | null {
  const upper = symbol.toUpperCase();
  return TOKEN_MAPPINGS[upper] || null;
}

/**
 * Get all supported tokens
 */
export function getSupportedTokens(): string[] {
  return Object.keys(TOKEN_MAPPINGS);
}

