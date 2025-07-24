/**
 * Token Resolution Utility
 * 
 * Provides token symbol to address resolution using tokenMap from MCP capabilities.
 * Based on lending-agent pattern but simplified for liquidation-prevention-agent.
 * Supports all chains available in the MCP server capabilities.
 */

// Token information type (matches context tokenMap structure)
export type TokenInfo = {
  chainId: string;
  address: string;
  decimals: number;
};

// Token resolution result types
export type FindTokenResult =
  | { type: 'found'; token: TokenInfo }
  | { type: 'notFound' }
  | { type: 'clarificationNeeded'; options: TokenInfo[] };

/**
 * Find token information by symbol in the tokenMap
 * @param tokenMap The token map loaded from MCP capabilities
 * @param tokenName The token symbol to search for
 * @returns Result indicating found token, not found, or needs clarification
 */
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

/**
 * Resolve token symbol to address and chain info
 * @param tokenMap The token map loaded from MCP capabilities
 * @param tokenSymbol The token symbol to resolve
 * @param preferredChainId Optional preferred chain ID (if not specified, will require clarification for multi-chain tokens)
 * @returns Token info object with address, chainId, and decimals
 * @throws Error if token not found or needs clarification
 */
export function resolveTokenInfo(
  tokenMap: Record<string, Array<TokenInfo>>,
  tokenSymbol: string,
  preferredChainId?: string
): TokenInfo {
  const findResult = findTokenInfo(tokenMap, tokenSymbol);

  switch (findResult.type) {
    case 'notFound':
      const availableTokens = Object.keys(tokenMap).join(', ');
      throw new Error(
        `Token '${tokenSymbol}' not supported. Available tokens: ${availableTokens}`
      );

    case 'clarificationNeeded':
      // If a preferred chain is specified, try to find it
      if (preferredChainId) {
        const preferredToken = findResult.options.find(token => token.chainId === preferredChainId);
        if (preferredToken) {
          return preferredToken;
        }
      }

      // Otherwise, require clarification
      const chainOptions = findResult.options
        .map(token => {
          const chainName = getChainName(token.chainId);
          return `${tokenSymbol} on ${chainName} (Chain ID: ${token.chainId})`;
        })
        .join(', ');
      throw new Error(
        `Multiple chains found for ${tokenSymbol}: ${chainOptions}. Please specify the chain ID in your request.`
      );

    case 'found':
      return findResult.token;
  }
}

/**
 * Resolve token symbol to address only (for backward compatibility)
 * @param tokenMap The token map loaded from MCP capabilities
 * @param tokenSymbol The token symbol to resolve
 * @param preferredChainId Optional preferred chain ID
 * @returns Token address string
 * @throws Error if token not found or needs clarification
 */
export function resolveTokenAddress(
  tokenMap: Record<string, Array<TokenInfo>>,
  tokenSymbol: string,
  preferredChainId?: string
): string {
  const tokenInfo = resolveTokenInfo(tokenMap, tokenSymbol, preferredChainId);
  return tokenInfo.address;
}

/**
 * Get human-readable chain name from chain ID
 * @param chainId The chain ID string
 * @returns Human-readable chain name
 */
export function getChainName(chainId: string): string {
  const chainNames: Record<string, string> = {
    '1': 'Ethereum Mainnet',
    '10': 'Optimism',
    '137': 'Polygon',
    '8453': 'Base',
    '42161': 'Arbitrum One',
  };

  return chainNames[chainId] || `Chain ${chainId}`;
}

/**
 * Check if a string looks like a token symbol (vs address)
 * @param input The input string to check
 * @returns true if it looks like a symbol, false if it looks like an address
 */
export function isTokenSymbol(input: string): boolean {
  // Addresses start with 0x and are 42 characters long
  if (input.startsWith('0x') && input.length === 42) {
    return false;
  }

  // Symbols are typically 2-6 characters, all uppercase or mixed case
  if (input.length >= 2 && input.length <= 10 && !/^0x/.test(input)) {
    return true;
  }

  return false;
}
