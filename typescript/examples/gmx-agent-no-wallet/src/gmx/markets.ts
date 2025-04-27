import { GmxSdk } from '@gmx-io/sdk';
import type { MarketInfo, MarketsInfoData } from '@gmx-io/sdk/types/markets.js';
import type { TokenData, TokensData } from '@gmx-io/sdk/types/tokens.js';

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

/**
 * Get market information from GMX
 * @param gmxClient The GMX SDK client
 * @returns Market information and token data
 */
export async function getMarketInfo(gmxClient: GmxSdk): Promise<any> {
  console.log('Fetching market information...');
  const errors: string[] = [];
  let marketsInfoData: MarketsInfoData | undefined;
  let tokensData: TokensData | undefined;

  try {
    // Attempt to fetch market data
    const result = await gmxClient.markets.getMarketsInfo();
    marketsInfoData = result.marketsInfoData;
    tokensData = result.tokensData;

    if (!marketsInfoData || !tokensData) {
      throw new Error('Failed to fetch markets info or tokens data');
    }
  } catch (error) {
    console.error('Error fetching market info:', error);
    errors.push(`Error fetching market info: ${(error as Error).message}`);

    // If we completely failed, return error
    if (!marketsInfoData || !tokensData) {
      return {
        success: false,
        message: `Error fetching market info: ${(error as Error).message}`,
        markets: [],
        tokens: [],
        errors,
      };
    }
  }

  let marketInfoCount = Object.keys(marketsInfoData).length;
  let tokenDataCount = Object.keys(tokensData).length;
  // Return processed data along with any errors
  const output = {
    success: marketInfoCount > 0 || tokenDataCount > 0,
    totalMarketInfoCount: marketInfoCount,
    totalTokenDataCount: tokenDataCount,
    // Convert BigInt values to strings before serialization
    marketsInfoData,
    tokensData,
    modifiedMarketsInfoData: convertBigIntToString(marketsInfoData),
    modifiedTokensData: convertBigIntToString(tokensData),
    errors: errors.length > 0 ? errors : undefined,
  };

  return output;
}
