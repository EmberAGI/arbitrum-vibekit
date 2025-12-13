import { Currency, Token, TradeType } from '@uniswap/sdk-core';
import { Pool, Route } from '@uniswap/v3-sdk';
import { getAddress } from 'ethers/lib/utils';
import type {
  RouteHop,
  RouteSummary,
  ChainId,
} from '../schemas/index.js';
import { RoutingError } from '../errors/index.js';

/**
 * Convert Uniswap SDK route to our RouteSummary format
 */
export function convertRouteToSummary(
  route: Route<Currency, Currency>,
  pools: Pool[]
): RouteSummary {
  const hops: RouteHop[] = [];
  const path = route.path;

  for (let i = 0; i < path.length - 1; i++) {
    const tokenIn = path[i]!;
    const tokenOut = path[i + 1]!;
    const pool = pools[i];

    if (!pool) {
      throw new RoutingError(`Pool not found for hop ${i}`);
    }

    // Determine if this is v2 or v3 based on pool structure
    // v3 pools have tickSpacing, v2 pools don't
    const isV3 = 'tickSpacing' in pool;
    const fee = isV3 ? pool.fee : 3000; // Default v2 fee tier

    hops.push({
      tokenIn: getAddress(tokenIn.address),
      tokenOut: getAddress(tokenOut.address),
      poolAddress: getAddress(pool.token0.address), // This will be updated with actual pool address
      fee,
      type: isV3 ? 'v3' : 'v2',
    });
  }

  // Calculate total fee (sum of all fees in the route)
  const totalFee = route.pools.reduce(
    (sum, pool) => sum + (pool.fee || 3000),
    0
  );

  return {
    hops,
    totalFee: totalFee.toString(),
    priceImpact: '0', // Will be calculated by the caller
  };
}

/**
 * Calculate price impact percentage
 */
export function calculatePriceImpact(
  amountIn: bigint,
  amountOut: bigint,
  expectedAmountOut: bigint
): string {
  if (expectedAmountOut === 0n) {
    return '0';
  }

  const impact =
    (Number(expectedAmountOut - amountOut) / Number(expectedAmountOut)) * 100;
  return Math.abs(impact).toFixed(4);
}

/**
 * Calculate minimum amount out with slippage
 */
export function calculateMinimumAmountOut(
  amountOut: bigint,
  slippageTolerance: number
): bigint {
  const slippageBps = BigInt(Math.floor(slippageTolerance * 100));
  const slippageAmount = (amountOut * slippageBps) / 10000n;
  return amountOut - slippageAmount;
}

