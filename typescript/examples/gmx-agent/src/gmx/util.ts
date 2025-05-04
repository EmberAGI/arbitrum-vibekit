import type { TokenData, TokensData } from '@gmx-io/sdk/types/tokens';

/**
 * Get token address by symbol
 */
export function getTokenAddress(tokenSymbol: string, tokensData: TokensData): string {
  const token = Object.values(tokensData).find(
    (token) => token.symbol.toLowerCase() === tokenSymbol.toLowerCase(),
  );
  if (!token) {
    throw new Error(`Token with symbol ${tokenSymbol} not found`);
  }
  return token.address;
}

/**
 * Get token data by symbol
 */
export function getTokenData(tokenSymbol: string, tokensData: TokensData): TokenData {
  const token = Object.values(tokensData).find(
    (token) => token.symbol.toLowerCase() === tokenSymbol.toLowerCase(),
  );
  if (!token) {
    throw new Error(`Token with symbol ${tokenSymbol} not found`);
  }
  return token;
}

/**
 * Recursively convert BigInt values to strings
 */
export function convertBigIntToString(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToString);
  }

  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = convertBigIntToString(obj[key]);
      }
    }
    return newObj;
  }

  return obj;
}
