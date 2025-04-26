import { GmxSdk } from "@gmx-io/sdk";
import type { MarketInfo, MarketsData } from "@gmx-io/sdk/types/markets.js";
import type {  TokensData } from "@gmx-io/sdk/types/tokens.js";
import type { Position, PositionsData } from "@gmx-io/sdk/types/positions.js";
import { convertBigIntToString, getMarketInfo } from "./markets.js";

/**
 * Get position information for a specific account
 * @param gmxClient - The GMX SDK instance
 * @param account - The account address to get positions for
 * @returns Position information with analysis
 */
export async function getPositionInfo(gmxClient: GmxSdk, account?: string) {
  try {
    // Set the account if provided
    if (account) {
      gmxClient.setAccount(account as `0x${string}`);
    } else if (!gmxClient.account) {
      throw new Error("No account provided and no account set in GMX client");
    }

    console.log("Getting position info for account:", gmxClient.account);
    try {
      // Get markets info and tokens data with a timeout
      const marketInfoResponse= await getMarketInfo(gmxClient);

      if (!marketInfoResponse?.success || !marketInfoResponse?.marketsInfoData || !marketInfoResponse?.tokensData) {
        throw new Error("Failed to fetch markets info or tokens data");
      }

      // Get positions for the account
      const positionsResult = await gmxClient.positions.getPositions({
        marketsData: marketInfoResponse.marketsInfoData as MarketsData,
        tokensData: marketInfoResponse.tokensData as TokensData,
        start: 0,
        end: 1000,
      });

      if (positionsResult.error){
        console.error("Error fetching positions:", positionsResult.error);
        return {
            success: true,
            message: "No positions found for this account",
            error: positionsResult.error,
        }
      }
    
      // Get positions data from the result
      const positions:PositionsData = positionsResult.positionsData;
      const positionCount = Object.keys(positions).length;

      return {
        success: true,
        positionCount,
        positions: positions,
        modifiedPositions: convertBigIntToString(positions),
      };
    } catch (marketError) {
      console.error("Error fetching market data:", marketError);
      return {
        success: false,
        message: `Error with GMX markets: ${(marketError as Error).message}. Please try again later.`,
        positions: [],
      };
    }
  } catch (error) {
    console.error("Error fetching position info:", error);
    return {
      success: false,
      message: `Error fetching position info: ${(error as Error).message}`,
      positions: [],
    };
  }
} 