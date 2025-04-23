import { ethers } from 'ethers';

/**
 * Create an increase position order on GMX
 */
export async function createIncreasePosition(gmxClient: any, params: any) {
  try {
    // Extract parameters
    const {
      marketAddress,
      collateralTokenAddress,
      collateralAmount,
      leverage,
      slippage = 50, // Default slippage of 0.5%
      isLong = true, // Default to long
      rawMarketData,
      rawTokenData,
      fullMarketInfo,
    } = params;

    if (!gmxClient) {
      return {
        success: false,
        error: 'GMX client not initialized',
      };
    }

    if (!marketAddress || !collateralTokenAddress || !collateralAmount) {
      return {
        success: false,
        error: 'Missing required parameters',
      };
    }

    console.log(`Creating increase position order: market=${marketAddress}, collateral=${collateralTokenAddress}, amount=${collateralAmount}, leverage=${leverage}x, isLong=${isLong}`);

    // For no-wallet version, we'll simulate the transaction without signing it
    // In a real implementation, you would prepare the transaction and sign it with a wallet

    // Get market info if not provided
    let marketInfo = rawMarketData;
    if (!marketInfo) {
      const markets = await gmxClient.getMarketsInfo();
      marketInfo = markets.marketsInfoData[marketAddress];
      if (!marketInfo) {
        return {
          success: false,
          error: 'Market not found',
        };
      }
    }

    // Create a simulated order structure
    const orderParams = {
      marketAddress,
      collateralTokenAddress,
      isLong,
      sizeDeltaUsd: ethers.utils.parseUnits((Number(collateralAmount) * leverage).toString(), 30).toString(),
      collateralDeltaAmount: ethers.utils.parseUnits(collateralAmount, marketInfo?.longToken?.decimals || 18).toString(),
      slippage,
      acceptablePrice: '0', // In a real implementation, you would calculate this
      executionFee: '0', // In a real implementation, you would estimate this
    };

    // In a real implementation with a wallet, you would create and send the transaction
    // For this example, we'll return a simulated response
    return {
      success: true,
      orderType: 'INCREASE',
      orderDetails: {
        ...orderParams,
        marketInfo: {
          name: marketInfo?.indexToken?.symbol ? `${marketInfo.indexToken.symbol}/USD` : 'Unknown Market',
          longToken: marketInfo?.longToken?.symbol || 'Unknown',
          shortToken: marketInfo?.shortToken?.symbol || 'Unknown',
        },
        simulatedResult: {
          positionSizeUsd: ethers.utils.parseUnits((Number(collateralAmount) * leverage).toString(), 30).toString(),
          collateralAmount: ethers.utils.parseUnits(collateralAmount, marketInfo?.longToken?.decimals || 18).toString(),
          leverage: leverage.toString(),
          side: isLong ? 'LONG' : 'SHORT',
          estimatedExecutionFee: ethers.utils.parseEther('0.01').toString(), // Placeholder
          estimatedGasLimit: '500000', // Placeholder
        },
      },
    };
  } catch (error) {
    console.error('Error creating increase position:', error);
    return {
      success: false,
      error: `Failed to create increase position: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Create a decrease position order on GMX
 */
export async function createDecreasePosition(gmxClient: any, params: any) {
  try {
    // Extract parameters
    const {
      marketAddress,
      collateralTokenAddress,
      collateralAmount,
      slippage = 50, // Default slippage of 0.5%
      isClosePosition = false,
      rawMarketData,
      rawTokenData,
      fullMarketInfo,
    } = params;

    if (!gmxClient) {
      return {
        success: false,
        error: 'GMX client not initialized',
      };
    }

    if (!marketAddress) {
      return {
        success: false,
        error: 'Missing required parameters',
      };
    }

    console.log(`Creating decrease position order: market=${marketAddress}, collateral=${collateralTokenAddress}, amount=${collateralAmount}, isClose=${isClosePosition}`);

    // For no-wallet version, we'll simulate the transaction without signing it
    // In a real implementation, you would prepare the transaction and sign it with a wallet

    // Get market info if not provided
    let marketInfo = rawMarketData;
    if (!marketInfo) {
      const markets = await gmxClient.getMarketsInfo();
      marketInfo = markets.marketsInfoData[marketAddress];
      if (!marketInfo) {
        return {
          success: false,
          error: 'Market not found',
        };
      }
    }

    // Create a simulated order structure
    const orderParams = {
      marketAddress,
      collateralTokenAddress: collateralTokenAddress || marketInfo?.longToken?.address,
      isLong: true, // This would be determined by the actual position
      sizeDeltaUsd: isClosePosition ? 'MAX_AMOUNT' : ethers.utils.parseUnits(collateralAmount || '0', 30).toString(),
      collateralDeltaAmount: ethers.utils.parseUnits(collateralAmount || '0', marketInfo?.longToken?.decimals || 18).toString(),
      slippage,
      acceptablePrice: '0', // In a real implementation, you would calculate this
      executionFee: '0', // In a real implementation, you would estimate this
    };

    // In a real implementation with a wallet, you would create and send the transaction
    // For this example, we'll return a simulated response
    return {
      success: true,
      orderType: 'DECREASE',
      isClosePosition,
      orderDetails: {
        ...orderParams,
        marketInfo: {
          name: marketInfo?.indexToken?.symbol ? `${marketInfo.indexToken.symbol}/USD` : 'Unknown Market',
          longToken: marketInfo?.longToken?.symbol || 'Unknown',
          shortToken: marketInfo?.shortToken?.symbol || 'Unknown',
        },
        simulatedResult: {
          collateralAmount: ethers.utils.parseUnits(collateralAmount || '0', marketInfo?.longToken?.decimals || 18).toString(),
          isClose: isClosePosition,
          estimatedExecutionFee: ethers.utils.parseEther('0.01').toString(), // Placeholder
          estimatedGasLimit: '400000', // Placeholder
        },
      },
    };
  } catch (error) {
    console.error('Error creating decrease position:', error);
    return {
      success: false,
      error: `Failed to create decrease position: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
} 