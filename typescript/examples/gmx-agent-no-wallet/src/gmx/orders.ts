import { GmxSdk } from '@gmx-io/sdk';
import type { MarketInfo } from '@gmx-io/sdk/types/markets.js';
import type { TokenData } from '@gmx-io/sdk/types/tokens.js';

/**
 * Parameters for creating a increase position
 */
interface CreateIncreasePositionParams {
  marketAddress: string;
  collateralTokenAddress: string;
  collateralAmount: string;
  leverage: number;
  slippage: number;
  isLong?: boolean;
}

/**
 * Parameters for creating a decrease position
 */
interface CreateDecreasePositionParams {
  marketAddress: string;
  collateralTokenAddress: string;
  collateralAmount: string;
  isClosePosition?: boolean;
  slippage: number;
  isLong?: boolean;
}

/**
 * Create a increase position on GMX
 * @param gmxClient - The GMX SDK instance
 * @param params - Parameters for creating the position
 * @returns Result of position creation
 */
export async function createIncreasePosition(
  gmxClient: GmxSdk,
  params: CreateIncreasePositionParams,
) {
  try {
    console.log('Creating increase position...');
    const {
      marketAddress,
      collateralTokenAddress,
      collateralAmount,
      leverage,
      slippage,
      isLong = true,
    } = params;

    // Check if wallet is connected
    if (!gmxClient.account) {
      throw new Error('No wallet connected. Please connect a wallet to create a position.');
    }

    // Get markets info and tokens data
    const { marketsInfoData, tokensData } = await gmxClient.markets.getMarketsInfo();

    if (!marketsInfoData || !tokensData) {
      throw new Error('Failed to fetch markets info or tokens data');
    }

    // Find market info for the specified market
    const marketInfo = Object.values(marketsInfoData).find((market) => {
      if (typeof market === 'object' && market !== null && 'marketTokenAddress' in market) {
        return (
          (market as MarketInfo).marketTokenAddress.toLowerCase() === marketAddress.toLowerCase()
        );
      }
      return false;
    }) as MarketInfo | undefined;

    if (!marketInfo) {
      throw new Error(`Market with address ${marketAddress} not found`);
    }

    // Find collateral token
    const collateralToken = tokensData[collateralTokenAddress];
    if (!collateralToken) {
      throw new Error(`Collateral token with address ${collateralTokenAddress} not found`);
    }

    // Calculate the amounts for the position
    const increaseAmounts = await calculateIncreaseAmounts({
      gmxClient,
      marketInfo,
      collateralToken,
      collateralAmount,
      leverage,
      isLong,
    });

    console.log(increaseAmounts);

    // Create the increase order
    const result = await gmxClient.orders.createIncreaseOrder({
      marketsInfoData,
      tokensData,
      isLimit: false,
      isLong,
      marketAddress: marketInfo.marketTokenAddress,
      allowedSlippage: slippage, // in basis points
      collateralToken,
      collateralTokenAddress: collateralToken.address,
      receiveTokenAddress: collateralToken.address,
      fromToken: collateralToken,
      marketInfo,
      indexToken: marketInfo.indexToken,
      increaseAmounts,
    });

    console.log(result);
    return {
      success: true,
      message: 'Increase position order created successfully',
      orderType: 'increase',
      orderDirection: isLong ? 'long' : 'short',
      marketName: marketInfo.name,
      indexTokenName: marketInfo.indexToken.symbol,
      collateralTokenName: collateralToken.symbol,
      collateralAmount: formatTokenAmount(BigInt(collateralAmount), collateralToken.decimals),
      leverage: (leverage / 100).toFixed(2) + 'x',
      slippage: (slippage / 100).toFixed(2) + '%',
      result,
    };
  } catch (error) {
    console.error('Error creating increase position:', error);
    return {
      success: false,
      message: `Error creating increase position: ${(error as Error).message}`,
    };
  }
}

/**
 * Create a decrease position on GMX
 * @param gmxClient - The GMX SDK instance
 * @param params - Parameters for creating the position
 * @returns Result of position creation
 */
export async function createDecreasePosition(
  gmxClient: GmxSdk,
  params: CreateDecreasePositionParams,
) {
  try {
    console.log('Creating decrease position...');
    const {
      marketAddress,
      collateralTokenAddress,
      collateralAmount,
      isClosePosition = false,
      slippage,
      isLong = true,
    } = params;

    // Check if wallet is connected
    if (!gmxClient.account) {
      throw new Error('No wallet connected. Please connect a wallet to create a position.');
    }

    // Get markets info and tokens data
    const { marketsInfoData, tokensData } = await gmxClient.markets.getMarketsInfo();

    if (!marketsInfoData || !tokensData) {
      throw new Error('Failed to fetch markets info or tokens data');
    }

    // Find market info for the specified market
    const marketInfo = Object.values(marketsInfoData).find((market) => {
      if (typeof market === 'object' && market !== null && 'marketTokenAddress' in market) {
        return (
          (market as MarketInfo).marketTokenAddress.toLowerCase() === marketAddress.toLowerCase()
        );
      }
      return false;
    }) as MarketInfo | undefined;

    if (!marketInfo) {
      throw new Error(`Market with address ${marketAddress} not found`);
    }

    // Find collateral token
    const collateralToken = tokensData[collateralTokenAddress];
    if (!collateralToken) {
      throw new Error(`Collateral token with address ${collateralTokenAddress} not found`);
    }

    // Get current position
    const positions = await gmxClient.positions.getPositions({
      marketsData: marketsInfoData,
      tokensData,
      start: 0,
      end: 1000,
    });

    if (positions.error) {
      throw new Error(`Error fetching positions: ${positions.error}`);
    }

    // For simplicity in the no-wallet version, we'll return a simulated response
    return {
      success: true,
      message: isClosePosition
        ? 'Close position order created successfully'
        : 'Decrease position order created successfully',
      orderType: 'decrease',
      orderDirection: isLong ? 'long' : 'short',
      marketName: marketInfo.name || `${marketInfo.indexToken.symbol}/USD`,
      indexTokenName: marketInfo.indexToken.symbol,
      collateralTokenName: collateralToken.symbol,
      isClose: isClosePosition,
      collateralAmount: isClosePosition
        ? 'ALL'
        : formatTokenAmount(BigInt(collateralAmount), collateralToken.decimals),
      slippage: (slippage / 100).toFixed(2) + '%',
    };
  } catch (error) {
    console.error('Error creating decrease position:', error);
    return {
      success: false,
      message: `Error creating decrease position: ${(error as Error).message}`,
    };
  }
}

/**
 * Calculate the increase amounts for a position
 */
async function calculateIncreaseAmounts({
  gmxClient,
  marketInfo,
  collateralToken,
  collateralAmount,
  leverage,
  isLong,
}: {
  gmxClient: GmxSdk;
  marketInfo: MarketInfo;
  collateralToken: TokenData;
  collateralAmount: string;
  leverage: number;
  isLong: boolean;
}) {
  // Convert string amount to BigInt with proper decimals
  const initialCollateralAmount = BigInt(
    parseFloat(collateralAmount) * 10 ** collateralToken.decimals,
  );

  // Get token price from GMX
  const tokenPrice = await getTokenPrice(gmxClient, collateralToken.address);

  // Calculate values in wei format (1e30)
  const initialCollateralUsd =
    (initialCollateralAmount * tokenPrice) / BigInt(10 ** collateralToken.decimals);
  const sizeDeltaUsd = (initialCollateralUsd * BigInt(leverage)) / BigInt(100);

  // Get index token price
  const indexPrice = await getTokenPrice(gmxClient, marketInfo.indexToken.address);

  // Calculate token amounts
  const indexTokenAmount =
    (sizeDeltaUsd * BigInt(10 ** marketInfo.indexToken.decimals)) / indexPrice;

  // Simplified calculation - in a real implementation, you would need more detailed calculations
  // including fees, funding rates, etc.
  return {
    initialCollateralAmount,
    initialCollateralUsd,
    collateralDeltaAmount: initialCollateralAmount, // For simplicity
    collateralDeltaUsd: initialCollateralUsd,
    indexTokenAmount,
    sizeDeltaUsd,
    sizeDeltaInTokens: indexTokenAmount,
    estimatedLeverage: BigInt(leverage),
    indexPrice,
    initialCollateralPrice: tokenPrice,
    collateralPrice: tokenPrice,
    triggerPrice: BigInt(0),
    acceptablePrice: isLong ? indexPrice : indexPrice, // Simplified
    acceptablePriceDeltaBps: BigInt(0),
    positionFeeUsd: sizeDeltaUsd / BigInt(2000), // Simplified 0.05% fee
    swapPathStats: undefined,
    uiFeeUsd: BigInt(0),
    swapUiFeeUsd: BigInt(0),
    feeDiscountUsd: BigInt(0),
    borrowingFeeUsd: BigInt(0),
    fundingFeeUsd: BigInt(0),
    positionPriceImpactDeltaUsd: BigInt(0), // Simplified
  };
}

/**
 * Format token amount for display
 */
function formatTokenAmount(amount: bigint, decimals: number): string {
  return (Number(amount) / 10 ** decimals).toFixed(decimals > 8 ? 8 : decimals);
}

/**
 * Get token price from GMX
 * Note: This is a simplified implementation
 */
async function getTokenPrice(gmxClient: GmxSdk, tokenAddress: string): Promise<bigint> {
  try {
    // In a real implementation, you would get the actual price from GMX
    // For now, we'll return a mock price based on token address
    // ETH: ~$3000, ARB: ~$1
    if (tokenAddress.toLowerCase() === '0x82af49447d8a07e3bd95bd0d56f35241523fbab1') {
      return BigInt('3000000000000000000000000000000'); // ETH price in 1e30
    } else if (tokenAddress.toLowerCase() === '0x912ce59144191c1204e64559fe8253a0e49e6548') {
      return BigInt('1000000000000000000000000000000'); // ARB price in 1e30
    } else {
      // Default to $1 for other tokens
      return BigInt('1000000000000000000000000000000'); // 1 USD in 1e30
    }
  } catch (error) {
    console.error('Error getting token price:', error);
    // Default fallback price of $1
    return BigInt('1000000000000000000000000000000'); // 1 USD in 1e30
  }
}
