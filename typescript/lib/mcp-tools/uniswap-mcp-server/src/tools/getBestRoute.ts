import { CurrencyAmount, Token, TradeType, Percent } from '@uniswap/sdk-core';
import { AlphaRouter, SwapType } from '@uniswap/smart-order-router';
import { utils } from 'ethers';
const { getAddress } = utils;
import { Contract } from 'ethers';
import type {
  GetBestRouteRequest,
  GetBestRouteResponse,
} from '../schemas/index.js';
import { getProvider } from '../utils/provider.js';
import {
  validateAddress,
  validatePositiveAmount,
  validateDifferentTokens,
} from '../utils/validation.js';
import { RoutingError, TokenError } from '../errors/index.js';

/**
 * Get the best route for a token swap
 */
export async function getBestRoute(
  request: GetBestRouteRequest
): Promise<GetBestRouteResponse> {
  // Validate inputs
  const tokenIn = validateAddress(request.tokenIn);
  const tokenOut = validateAddress(request.tokenOut);
  validateDifferentTokens(tokenIn, tokenOut);
  const amount = validatePositiveAmount(request.amount);

  const provider = getProvider(request.chainId);

  // Create token instances
  let tokenInInstance: Token;
  let tokenOutInstance: Token;

  try {
    const tokenInContract = new Contract(
      tokenIn,
      [
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
        'function name() view returns (string)',
      ],
      provider
    );

    const tokenOutContract = new Contract(
      tokenOut,
      [
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
        'function name() view returns (string)',
      ],
      provider
    );

    const [tokenInDecimals, tokenOutDecimals, tokenInSymbol, tokenOutSymbol, tokenInName, tokenOutName] = await Promise.all([
      tokenInContract['decimals'](),
      tokenOutContract['decimals'](),
      tokenInContract['symbol'](),
      tokenOutContract['symbol'](),
      tokenInContract['name'](),
      tokenOutContract['name'](),
    ]);

    tokenInInstance = new Token(
      request.chainId,
      tokenIn,
      tokenInDecimals,
      tokenInSymbol,
      tokenInName
    );

    tokenOutInstance = new Token(
      request.chainId,
      tokenOut,
      tokenOutDecimals,
      tokenOutSymbol,
      tokenOutName
    );
  } catch (error) {
    throw new TokenError(
      `Failed to fetch token metadata: ${(error as Error).message}`,
      { tokenIn, tokenOut }
    );
  }

  // Create currency amount
  const currencyAmount = CurrencyAmount.fromRawAmount(
    tokenInInstance,
    amount.toString()
  );

  // Initialize router
  const router = new AlphaRouter({
    chainId: request.chainId,
    provider,
  });

  // Get best route
  const route = await router.route(
    currencyAmount,
    tokenOutInstance,
    TradeType.EXACT_INPUT,
    {
      recipient: getAddress('0x0000000000000000000000000000000000000000'),
      slippageTolerance: new Percent(50, 10000), // 0.5% default
      deadline: Math.floor(Date.now() / 1000) + 60 * 20,
      type: SwapType.SWAP_ROUTER_02,
    }
  );

  if (!route) {
    throw new RoutingError('No route found for the given token pair', {
      tokenIn,
      tokenOut,
      amount: amount.toString(),
    });
  }

  // Build route summary from trade
  const trade = route.trade;
  const hops: Array<{
    tokenIn: string;
    tokenOut: string;
    poolAddress: string;
    fee: number;
    type: 'v2' | 'v3';
  }> = [];
  let totalFee = 0;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const swaps = (trade as any).swaps || [];
    for (const swap of swaps) {
      const swapRoute = swap.route;
      if (swapRoute && swapRoute.tokenPath && swapRoute.pools) {
        for (let i = 0; i < swapRoute.tokenPath.length - 1; i++) {
          const tokenIn = swapRoute.tokenPath[i];
          const tokenOut = swapRoute.tokenPath[i + 1];
          const pool = swapRoute.pools[i];

          if (tokenIn && tokenOut && pool) {
            const fee = pool.fee || 3000;
            totalFee += fee;
            hops.push({
              tokenIn: getAddress(tokenIn.address),
              tokenOut: getAddress(tokenOut.address),
              poolAddress: getAddress(pool.token0?.address || tokenIn.address),
              fee,
              type: pool.fee ? 'v3' : 'v2',
            });
          }
        }
      }
    }
  } catch (_error) {
    // Fallback: create simple hop
    hops.push({
      tokenIn,
      tokenOut,
      poolAddress: tokenIn,
      fee: 3000,
      type: 'v3',
    });
    totalFee = 3000;
  }

  const routeSummary = {
    hops,
    totalFee: totalFee.toString(),
    priceImpact: trade.priceImpact ? (Number(trade.priceImpact.toFixed()) * 100).toFixed(4) : '0',
  };

  return {
    route: routeSummary,
    estimatedGas: route.estimatedGasUsed?.toString(),
  };
}

