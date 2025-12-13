import { CurrencyAmount, Token, TradeType, Percent } from '@uniswap/sdk-core';
import { AlphaRouter, SwapType } from '@uniswap/smart-order-router';
import { utils } from 'ethers';
const { getAddress } = utils;
import { Contract } from 'ethers';
import type {
  GetSwapQuoteRequest,
  GetSwapQuoteResponse,
} from '../schemas/index.js';
import { getProvider } from '../utils/provider.js';
import {
  validateAddress,
  validatePositiveAmount,
  validateDifferentTokens,
  validateSlippageTolerance,
} from '../utils/validation.js';
import { calculateMinimumAmountOut } from '../utils/routing.js';
import { RoutingError, TokenError } from '../errors/index.js';
import { loadConfig } from '../utils/config.js';

/**
 * Get a swap quote for a token pair
 */
export async function getSwapQuote(
  request: GetSwapQuoteRequest
): Promise<GetSwapQuoteResponse> {
  // Validate inputs
  const tokenIn = validateAddress(request.tokenIn);
  const tokenOut = validateAddress(request.tokenOut);
  validateDifferentTokens(tokenIn, tokenOut);
  const amount = validatePositiveAmount(request.amount);
  const slippageTolerance =
    request.slippageTolerance !== undefined
      ? validateSlippageTolerance(request.slippageTolerance)
      : loadConfig().defaultSlippage;

  const provider = getProvider(request.chainId);

  // Create token instances
  let tokenInInstance: Token;
  let tokenOutInstance: Token;

  try {
    // Fetch token metadata (decimals, symbol, name)
    await Promise.all([
      provider.getCode(tokenIn),
      provider.getCode(tokenOut),
    ]);

    // For native ETH, we need to handle it differently
    // For now, assume ERC20 tokens and fetch decimals
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

  // Get quote
  const route = await router.route(
    currencyAmount,
    tokenOutInstance,
    TradeType.EXACT_INPUT,
    {
      recipient: getAddress('0x0000000000000000000000000000000000000000'), // Dummy recipient for quote
      slippageTolerance: new Percent(
        Math.floor(slippageTolerance * 100),
        10000
      ),
      deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes
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

  const quote = route.quote;
  const expectedAmountOut = quote.toFixed();
  const trade = route.trade;

  // Calculate price impact
  const priceImpact = trade.priceImpact
    ? (Number(trade.priceImpact.toFixed()) * 100).toFixed(4)
    : '0';

  const minimumAmountOut = calculateMinimumAmountOut(
    BigInt(expectedAmountOut),
    slippageTolerance
  );

  // Build route summary from trade routes
  const hops: Array<{
    tokenIn: string;
    tokenOut: string;
    poolAddress: string;
    fee: number;
    type: 'v2' | 'v3';
  }> = [];

  // Extract route information from trade
  // The trade object contains swaps with route information
  let totalFee = 0;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const swaps = (trade as any).swaps || [];
    for (const swap of swaps) {
      const route = swap.route;
      if (route && route.tokenPath && route.pools) {
        for (let i = 0; i < route.tokenPath.length - 1; i++) {
          const tokenIn = route.tokenPath[i];
          const tokenOut = route.tokenPath[i + 1];
          const pool = route.pools[i];

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
    // If route extraction fails, create a simple hop
    hops.push({
      tokenIn,
      tokenOut,
      poolAddress: tokenIn, // Fallback
      fee: 3000,
      type: 'v3',
    });
    totalFee = 3000;
  }

  const routeSummary = {
    hops,
    totalFee: totalFee.toString(),
    priceImpact,
  };

  return {
    expectedAmountOut,
    priceImpact,
    routeSummary,
    effectivePrice: (Number(amount) / Number(expectedAmountOut)).toString(),
    minimumAmountOut: minimumAmountOut.toString(),
  };
}

