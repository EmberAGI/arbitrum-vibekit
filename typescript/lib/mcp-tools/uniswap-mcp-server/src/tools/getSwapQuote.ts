import { CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core';
import { AlphaRouter, SwapType } from '@uniswap/smart-order-router';
import { getAddress } from 'ethers/lib/utils';
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
import { calculatePriceImpact, calculateMinimumAmountOut } from '../utils/routing.js';
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
    const [tokenInCode, tokenOutCode] = await Promise.all([
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

    const [tokenInDecimals, tokenOutDecimals] = await Promise.all([
      tokenInContract.decimals(),
      tokenOutContract.decimals(),
    ]);

    tokenInInstance = new Token(
      request.chainId,
      tokenIn,
      tokenInDecimals,
      await tokenInContract.symbol(),
      await tokenInContract.name()
    );

    tokenOutInstance = new Token(
      request.chainId,
      tokenOut,
      tokenOutDecimals,
      await tokenOutContract.symbol(),
      await tokenOutContract.name()
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
      slippageTolerance: {
        numerator: Math.floor(slippageTolerance * 100),
        denominator: 10000,
      },
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
  const priceImpact = route.estimatedGasUsedUSD
    ? calculatePriceImpact(
        amount,
        BigInt(expectedAmountOut),
        BigInt(expectedAmountOut)
      )
    : '0';

  const minimumAmountOut = calculateMinimumAmountOut(
    BigInt(expectedAmountOut),
    slippageTolerance
  );

  // Build route summary
  const routeSummary = {
    hops: route.route.path.map((token, index) => {
      if (index === route.route.path.length - 1) {
        return null;
      }
      const nextToken = route.route.path[index + 1]!;
      const pool = route.route.pools[index];
      return {
        tokenIn: getAddress(token.address),
        tokenOut: getAddress(nextToken.address),
        poolAddress: getAddress(pool.token0.address), // Simplified
        fee: pool.fee || 3000,
        type: 'v3' as const,
      };
    }).filter((hop): hop is NonNullable<typeof hop> => hop !== null),
    totalFee: route.route.pools
      .reduce((sum, pool) => sum + (pool.fee || 3000), 0)
      .toString(),
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

