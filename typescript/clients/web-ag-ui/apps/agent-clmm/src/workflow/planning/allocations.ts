import { parseUnits } from 'viem';

import { deriveMidPrice } from '../../core/decision-engine.js';
import type { CamelotPool, PriceRange } from '../../domain/types.js';

function requirePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
}

function toBaseUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Invalid token amount for allocation sizing');
  }
  return parseUnits(amount.toFixed(decimals), decimals);
}

function computeAmountsPerLiquidity(params: {
  currentPrice: number;
  lowerPrice: number;
  upperPrice: number;
}): { amount0: number; amount1: number } {
  const { currentPrice, lowerPrice, upperPrice } = params;
  if (lowerPrice >= upperPrice) {
    throw new Error('Invalid range bounds for allocation sizing');
  }

  const sqrtCurrent = Math.sqrt(currentPrice);
  const sqrtLower = Math.sqrt(lowerPrice);
  const sqrtUpper = Math.sqrt(upperPrice);

  if (![sqrtCurrent, sqrtLower, sqrtUpper].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Invalid price values for allocation sizing');
  }

  if (currentPrice <= lowerPrice) {
    return {
      amount0: (sqrtUpper - sqrtLower) / (sqrtLower * sqrtUpper),
      amount1: 0,
    };
  }
  if (currentPrice >= upperPrice) {
    return {
      amount0: 0,
      amount1: sqrtUpper - sqrtLower,
    };
  }

  return {
    amount0: (sqrtUpper - sqrtCurrent) / (sqrtCurrent * sqrtUpper),
    amount1: sqrtCurrent - sqrtLower,
  };
}

export function estimateTokenAllocationsUsd(
  pool: CamelotPool,
  baseContributionUsd: number,
  range: PriceRange,
): {
  token0: bigint;
  token1: bigint;
} {
  requirePositive(baseContributionUsd, 'baseContributionUsd');
  const midPrice = deriveMidPrice(pool);
  const token0Price =
    pool.token0.usdPrice ??
    (pool.token1.usdPrice && midPrice > 0 ? pool.token1.usdPrice * midPrice : undefined);
  const token1Price =
    pool.token1.usdPrice ??
    (pool.token0.usdPrice && midPrice > 0 ? pool.token0.usdPrice / midPrice : undefined);

  if (!token0Price || !token1Price || token0Price <= 0 || token1Price <= 0) {
    throw new Error('Token USD prices unavailable; cannot size allocations');
  }

  const lowerPrice = range.lowerPrice;
  const upperPrice = range.upperPrice;
  requirePositive(lowerPrice, 'range.lowerPrice');
  requirePositive(upperPrice, 'range.upperPrice');
  requirePositive(midPrice, 'midPrice');

  const perLiquidity = computeAmountsPerLiquidity({
    currentPrice: midPrice,
    lowerPrice,
    upperPrice,
  });
  const totalUsdPerLiquidity = perLiquidity.amount0 * token0Price + perLiquidity.amount1 * token1Price;
  if (!Number.isFinite(totalUsdPerLiquidity) || totalUsdPerLiquidity <= 0) {
    throw new Error('Unable to size allocations from current price range');
  }
  const liquidity = baseContributionUsd / totalUsdPerLiquidity;
  const amount0 = Math.max(0, perLiquidity.amount0 * liquidity);
  const amount1 = Math.max(0, perLiquidity.amount1 * liquidity);

  return {
    token0: toBaseUnits(amount0, pool.token0.decimals),
    token1: toBaseUnits(amount1, pool.token1.decimals),
  };
}
