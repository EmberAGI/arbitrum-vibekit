import { GmxSdk } from '@gmx-io/sdk';
import { getMarketInfo } from './markets.js';
import type { CreateSwapOrderParams } from '../agentToolHandlers.js';
import type { SwapAmounts } from '@gmx-io/sdk/types/trade.js';
import { getTokenData } from './util.js';

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

    // TODO
    let swapAmounts: SwapAmounts = {
      amountIn: BigInt(amount),
      usdIn: BigInt(0),
      amountOut: BigInt(0),
      usdOut: BigInt(0),
      priceIn: BigInt(0),
      priceOut: BigInt(0),
      swapPathStats: undefined,
      minOutputAmount: BigInt(0),
    };

    // Create swap parameters
    const swapOrderParams = {
      isLimit: isLimit ?? false,
      allowedSlippage: slippage ?? 50,
      swapAmounts: swapAmounts,
      fromToken: fromTokenData,
      toToken: toTokenData,
      tokensData: tokensData,
    };

    // Create the swap order
    try {
      console.log('Debug: creating swap order via GMX SDK');
      const result = await gmxClient.orders.createSwapOrder(swapOrderParams);
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
