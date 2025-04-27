import type { TokensData } from '@gmx-io/sdk/types/tokens.js';

export function getTokenAddress(tokenSymbol: string, tokensData: TokensData) {
  const token = Object.values(tokensData).find(
    (token) => token.symbol.toLowerCase() === tokenSymbol.toLowerCase(),
  );
  if (!token) {
    throw new Error(`Token with symbol ${tokenSymbol} not found`);
  }
  return token.address;
}

export function getTokenData(tokenSymbol: string, tokensData: TokensData) {
  const token = Object.values(tokensData).find(
    (token) => token.symbol.toLowerCase() === tokenSymbol.toLowerCase(),
  );
  if (!token) {
    throw new Error(`Token with symbol ${tokenSymbol} not found`);
  }
  return token;
}
