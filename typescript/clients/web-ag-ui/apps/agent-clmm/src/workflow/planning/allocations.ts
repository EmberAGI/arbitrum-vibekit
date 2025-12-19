import { parseUnits } from 'viem';

import { deriveMidPrice } from '../../core/decision-engine.js';
import type { CamelotPool } from '../../domain/types.js';

export function estimateTokenAllocationsUsd(pool: CamelotPool, baseContributionUsd: number): {
  token0: bigint;
  token1: bigint;
} {
  const half = baseContributionUsd / 2;
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

  const amount0 = parseUnits((half / token0Price).toFixed(pool.token0.decimals), pool.token0.decimals);
  const amount1 = parseUnits((half / token1Price).toFixed(pool.token1.decimals), pool.token1.decimals);

  return { token0: amount0, token1: amount1 };
}

