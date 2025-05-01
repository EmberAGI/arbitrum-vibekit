import { GmxSdk } from '@gmx-io/sdk';
import { getMarketInfo } from './markets.js';
import type { CreateSwapOrderParams } from '../agentToolHandlers.js';
import { getTokenData } from './util.js';
import { ethers } from 'ethers';

/**
 * Create a swap order on GMX
 * @param gmxClient - The GMX SDK instance
 * @param params - Swap order parameters
 * @returns Result of swap order creation
 */
export async function createSwapOrder(
  gmxClient: GmxSdk,
  args: CreateSwapOrderParams,
): Promise<any> {
  try {
    // Check if wallet is connected
    // Set the account if provided
    if (args.userAddress) {
      gmxClient.setAccount(args.userAddress as `0x${string}`);
    } else if (!gmxClient.account) {
      throw new Error('No account provided and no account set in GMX client');
    }

    // Ensure we have a wallet client with an account
    if (!gmxClient.walletClient?.account) {
      throw new Error('No wallet client or account available for transaction');
    }

    const { isLimit, fromToken, toToken, amount, slippage } = args;

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

    let fromTokenData = getTokenData(fromToken, tokensData);
    let toTokenData = getTokenData(toToken, tokensData);

    if (fromTokenData.address) {
      console.log('[Debug]: fromToken data ', fromTokenData.address);
    }

    if (toTokenData.address) {
      console.log('[Debug]: toToken data ', toTokenData.address);
    }

    const amountIn = ethers.utils.parseUnits(amount, fromTokenData.decimals).toString();

    let swapParams = {
        fromTokenAddress: fromTokenData.address,
        toTokenAddress: toTokenData.address,
        allowedSlippageBps: 125,
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
