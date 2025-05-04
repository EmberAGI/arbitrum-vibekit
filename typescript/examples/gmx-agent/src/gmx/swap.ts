import { GmxSdk } from '@gmx-io/sdk';
import { getMarketInfo } from './markets.js';
import type { CreateSwapOrderParams } from '../agentToolHandlers.js';
import { getTokenData } from './util.js';
import { ethers } from 'ethers';

/**
 * Create a swap order on GMX
 * @param gmxClient - The GMX SDK instance
 * @param params - Swap order parameters (fromToken, toToken, amount, slippage, isLimit)
 * @returns Result of swap order creation
 */
export async function createSwapOrder(
  gmxClient: GmxSdk,
  params: {
    fromToken: string; 
    toToken: string; 
    amount: string;
    slippage?: number;
    isLimit?: boolean;
  }
): Promise<any> {
  try {
    // Ensure we have a wallet client with an account
    if (!gmxClient.account) {
      throw new Error('No account available in GMX client');
    }

    const { isLimit, fromToken, toToken, amount, slippage } = params;

    if (!fromToken || !toToken) {
      throw new Error('From token or to token not provided');
    }

    const marketInfo = await getMarketInfo(gmxClient);
    if (!marketInfo.success) {
      throw new Error('Failed to fetch markets info data');
    }

    const { marketsInfoData, tokensData } = marketInfo;
    if (!marketsInfoData || !tokensData) {
      throw new Error('Failed to fetch markets info data');
    }

    console.log('Debug: fromToken ', fromToken);
    console.log('Debug: toToken ', toToken);

    let fromTokenData = getTokenData(fromToken, tokensData);
    let toTokenData = getTokenData(toToken, tokensData);

    if (fromTokenData.address) {
      console.log('[Debug]: fromToken address ', fromTokenData.address);
    }

    if (toTokenData.address) {
      console.log('[Debug]: toToken address ', toTokenData.address);
    }

    const amountIn = ethers.utils.parseUnits(amount, fromTokenData.decimals).toString();

    let swapParams = {
        fromTokenAddress: fromTokenData.address,
        toTokenAddress: toTokenData.address,
        allowedSlippageBps: slippage || 125, // Default to 1.25% if not specified
        fromAmount: BigInt(amountIn),
    };

    console.log('swap params ', swapParams);
    // Create the swap order
    try {
      console.log('Debug: creating swap order via GMX SDK');
      console.log('Debug: account ', await gmxClient.account);
      const result = await gmxClient.orders.swap(swapParams);
      console.log('Debug: swap order result', result);
      if (result.error) {
        throw new Error(`Failed to create swap order: ${result.error}`);
      }
    } catch (error) {
      console.error('Error while creating swap order via GMX SDK', error);
      throw error;
    }

    console.log('Swap order created successfully');

    return {
      success: true,
      message: 'Swap order created successfully',
      orderType: 'swap',
    };
  } catch (error) {
    console.error('Error creating swap order:', error);
    return {
      success: false,
      message: `Error creating swap order: ${(error as Error).message}`,
    };
  }
}
