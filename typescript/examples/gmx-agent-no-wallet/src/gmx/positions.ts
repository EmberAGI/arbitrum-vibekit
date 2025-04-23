import { GmxSdk } from "@gmx-io/sdk";
import type { MarketInfo, MarketsData } from "@gmx-io/sdk/types/markets.js";
import type {  TokensData } from "@gmx-io/sdk/types/tokens.js";
import type { Position, PositionsData } from "@gmx-io/sdk/types/positions.js";

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

    try {
      // Get markets info and tokens data with a timeout
      const marketsPromise = gmxClient.markets.getMarketsInfo();
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Timeout fetching market data"));
        }, 15000); // 15 second timeout
      });
      
      // Race the promises
      const { marketsInfoData, tokensData } = await Promise.race([
        marketsPromise,
        timeoutPromise as Promise<any>
      ]);
      
      if (!marketsInfoData || !tokensData) {
        throw new Error("Failed to fetch markets info or tokens data");
      }

      // Get positions for the account
      const positionsResult = await gmxClient.positions.getPositions({
        marketsData: marketsInfoData as MarketsData,
        tokensData,
        start: 0,
        end: 1000,
      });

      if (positionsResult.error){
        return {
            success: true,
            message: "No positions found for this account",
            error: positionsResult.error,
        }
      }
    
      // Get positions data from the result
      const positions:PositionsData = positionsResult.positionsData;
      console.log(positions);
      
      // Check if we have any positions by examining the object
      const positionKeys = Object.keys(positions);
      if (positionKeys.length === 0) {
        return {
          success: true,
          message: "No positions found for this account",
          positions: [],
        };
      }

      return {
        success: true,
        message: `Found ${positionKeys.length} position(s)`,
        positions: positions,
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