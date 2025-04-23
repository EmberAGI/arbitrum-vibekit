/**
 * Retrieves information about available GMX markets
 */
export async function getMarketInfo(gmxClient: any) {
  try {
    if (!gmxClient) {
      return {
        success: false,
        message: 'GMX client not initialized',
      };
    }

    // Fetch markets from GMX
    const marketsInfoData = await gmxClient.getMarketsInfo();
    
    if (!marketsInfoData || !marketsInfoData.marketsInfoData) {
      return {
        success: false,
        message: 'Failed to fetch markets info',
      };
    }

    // Extract tokens data
    const tokensData = marketsInfoData.tokensData || {};
    
    // Process the markets data
    const markets = Object.keys(marketsInfoData.marketsInfoData).map(marketAddress => {
      const marketInfo = marketsInfoData.marketsInfoData[marketAddress];
      
      // Extract market info
      const indexToken = marketInfo.indexToken ? {
        address: marketInfo.indexToken.address,
        symbol: marketInfo.indexToken.symbol,
        decimals: marketInfo.indexToken.decimals,
      } : null;
      
      const longToken = marketInfo.longToken ? {
        address: marketInfo.longToken.address,
        symbol: marketInfo.longToken.symbol,
        decimals: marketInfo.longToken.decimals,
      } : null;
      
      const shortToken = marketInfo.shortToken ? {
        address: marketInfo.shortToken.address,
        symbol: marketInfo.shortToken.symbol,
        decimals: marketInfo.shortToken.decimals,
      } : null;
      
      return {
        marketAddress,
        marketInfo: {
          indexToken,
          longToken,
          shortToken,
        },
        // Include the raw data for other functions to use
        rawMarketData: marketInfo,
      };
    });
    
    // Count unique tokens
    const uniqueTokens = new Set();
    markets.forEach(market => {
      if (market.marketInfo.indexToken?.address) uniqueTokens.add(market.marketInfo.indexToken.address);
      if (market.marketInfo.longToken?.address) uniqueTokens.add(market.marketInfo.longToken.address);
      if (market.marketInfo.shortToken?.address) uniqueTokens.add(market.marketInfo.shortToken.address);
    });
    
    return {
      success: true,
      marketCount: markets.length,
      tokenCount: uniqueTokens.size,
      markets,
      tokensData,
    };
  } catch (error) {
    console.error('Error getting GMX market info:', error);
    return {
      success: false,
      message: `Failed to get market info: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
} 