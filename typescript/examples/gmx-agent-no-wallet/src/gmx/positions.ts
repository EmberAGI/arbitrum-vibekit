import { ethers } from 'ethers';

/**
 * Get position information for a specific account
 */
export async function getPositionInfo(gmxClient: any, account: string) {
  try {
    if (!gmxClient) {
      return {
        success: false,
        message: 'GMX client not initialized',
      };
    }

    if (!account || !ethers.utils.isAddress(account)) {
      return {
        success: false,
        message: 'Invalid account address',
      };
    }

    // Fetch positions from GMX
    const positions = await gmxClient.getAccountPositions({
      account,
    });

    if (!positions || !Array.isArray(positions.positions)) {
      return {
        success: false,
        message: 'Failed to fetch positions',
      };
    }

    // Fetch markets info to get additional data
    const marketsInfoData = await gmxClient.getMarketsInfo();
    
    if (!marketsInfoData || !marketsInfoData.marketsInfoData) {
      return {
        success: false,
        message: 'Failed to fetch markets info',
      };
    }

    // Process positions with market data
    const processedPositions = positions.positions.map(position => {
      const marketInfo = marketsInfoData.marketsInfoData[position.marketAddress];
      
      // Format position information
      return {
        account: account,
        market: marketInfo?.indexToken?.symbol ? `${marketInfo.indexToken.symbol}/USD` : 'Unknown Market',
        marketAddress: position.marketAddress,
        side: position.isLong ? 'LONG' : 'SHORT',
        size: ethers.utils.formatUnits(position.sizeInUsd || '0', 30),
        collateral: ethers.utils.formatUnits(position.collateralAmount || '0', marketInfo?.longToken?.decimals || 18),
        leverage: (Number(position.sizeInUsd || 0) / Number(position.collateralUsd || 1)).toFixed(2) + 'x',
        entryPrice: ethers.utils.formatUnits(position.entryPrice || '0', 30),
        markPrice: ethers.utils.formatUnits(position.markPrice || '0', 30),
        liquidationPrice: ethers.utils.formatUnits(position.liquidationPrice || '0', 30),
        pnl: ethers.utils.formatUnits(position.pnl || '0', 30),
        pnlPercentage: ((Number(position.pnl || 0) / Number(position.collateralUsd || 1)) * 100).toFixed(2) + '%',
        // Raw data for other functions
        rawPosition: position,
        rawMarketInfo: marketInfo,
      };
    });

    return {
      success: true,
      account,
      positionCount: processedPositions.length,
      positions: processedPositions,
    };
  } catch (error) {
    console.error('Error getting position info:', error);
    return {
      success: false,
      message: `Failed to get position info: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
} 