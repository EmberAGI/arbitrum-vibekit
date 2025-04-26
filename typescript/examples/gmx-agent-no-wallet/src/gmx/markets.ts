import { GmxSdk } from "@gmx-io/sdk";
import type { MarketInfo, MarketsInfoData } from "@gmx-io/sdk/types/markets.js";
import type { TokenData, TokensData } from "@gmx-io/sdk/types/tokens.js";

/**
 * Recursively convert BigInt values to strings
 */
function convertBigIntToString(obj: any): any {
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
export async function getMarketInfo(gmxClient: GmxSdk) {
  console.log("Fetching market information...");
  const errors: string[] = [];
  let marketsInfoData: MarketsInfoData | undefined;
  let tokensData: TokensData | undefined;
  
  try {
    // Attempt to fetch market data
    const result = await gmxClient.markets.getMarketsInfo();
    marketsInfoData = result.marketsInfoData;
    tokensData = result.tokensData;
    
    if (!marketsInfoData || !tokensData) {
      throw new Error("Failed to fetch markets info or tokens data");
    }
  } catch (error) {
    console.error("Error fetching market info:", error);
    errors.push(`Error fetching market info: ${(error as Error).message}`);
    
    // If we completely failed, return error
    if (!marketsInfoData || !tokensData) {
      return {
        success: false,
        message: `Error fetching market info: ${(error as Error).message}`,
        markets: [],
        tokens: [],
        errors
      };
    }
  }
  
  // Process market data to make it more readable
  const processedMarkets: any[] = [];
  
  if (marketsInfoData) {
    for (const market of Object.values(marketsInfoData)) {
      try {
        processedMarkets.push({
          name: market.name || 'Unknown Market',
          marketAddress: market.marketTokenAddress,
          longToken: {
            symbol: market.longToken?.symbol || 'Unknown',
            address: market.longToken?.address || '',
            decimals: market.longToken?.decimals || 18
          },
          shortToken: {
            symbol: market.shortToken?.symbol || 'Unknown',
            address: market.shortToken?.address || '',
            decimals: market.shortToken?.decimals || 18
          },
          indexToken: {
            symbol: market.indexToken?.symbol || 'Unknown',
            address: market.indexToken?.address || '',
            decimals: market.indexToken?.decimals || 18
          }
        });
      } catch (marketError) {
        console.error(`Error processing market ${market.name || 'Unknown'}:`, marketError);
        errors.push(`Failed to process market ${market.name || 'Unknown'}: ${(marketError as Error).message}`);
      }
    }
  }
  
  // Process token data
  const processedTokens: any[] = [];
  
  if (tokensData) {
    for (const [address, token] of Object.entries(tokensData)) {
      try {
        processedTokens.push({
          symbol: token.symbol || 'Unknown',
          name: token.name || 'Unknown',
          address,
          decimals: token.decimals || 18
        });
      } catch (tokenError) {
        console.error(`Error processing token ${token.symbol || address}:`, tokenError);
        errors.push(`Failed to process token ${token.symbol || address}: ${(tokenError as Error).message}`);
      }
    }
  }
  
  // Format the markets for better readability with numbering
  const markets = processedMarkets.map((market: any, index: number) => ({
    number: index + 1,
    name: market.name,
    indexToken: market.indexToken.symbol,
    longToken: market.longToken.symbol,
    shortToken: market.shortToken.symbol,
    marketAddress: market.marketAddress
  }));
  
  // Format the tokens for better readability and remove duplicates
  const uniqueTokenSymbols = new Set<string>();
  const tokens = processedTokens
    .filter((token: any) => {
      if (token.symbol !== 'Unknown' && !uniqueTokenSymbols.has(token.symbol)) {
        uniqueTokenSymbols.add(token.symbol);
        return true;
      }
      return false;
    })
    .map((token: any) => ({
      symbol: token.symbol,
      name: token.name,
      address: token.address
    }));
  
  // Create a readable list for display
  const marketsTable = markets.map((m: any) => 
    `${m.number}. ${m.name}\n   Index Token: ${m.indexToken}\n   Long Token: ${m.longToken}\n   Short Token: ${m.shortToken}\n   Address: ${m.marketAddress}`
  ).join('\n\n');
  
  const tokensTable = tokens.map((t: any) => 
    `${t.symbol} (${t.name}): ${t.address}`
  ).join('\n');
  
  // Return processed data along with any errors
  const output =  {
    success: markets.length > 0 || tokens.length > 0,
    message: errors.length > 0 
      ? `Found ${markets.length} markets and ${tokens.length} tokens with ${errors.length} errors`
      : `Found ${markets.length} markets and ${tokens.length} tokens`,
    markets,
    tokens,
    marketCount: markets.length,
    tokenCount: tokens.length,
    marketsTable,
    tokensTable,
    summary: `GMX has ${markets.length} available markets and ${tokens.length} tradable tokens.`,
    note: errors.length > 0 ? 
      `Note: ${errors.length} market(s) could not be loaded due to errors.` : 
      undefined,
    // Convert BigInt values to strings before serialization
    rawMarketsInfoData: convertBigIntToString(marketsInfoData),
    rawTokensData: convertBigIntToString(tokensData),
    errors: errors.length > 0 ? errors : undefined
  };

  return output;
} 