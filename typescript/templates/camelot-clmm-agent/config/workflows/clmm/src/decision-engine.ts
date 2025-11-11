import { formatUnits } from 'viem';

import {
  AUTO_COMPOUND_COST_RATIO,
  DEFAULT_MIN_TVL_USD,
  DEFAULT_REBALANCE_THRESHOLD_PCT,
  DEFAULT_TICK_BANDWIDTH_BPS,
  VOLATILE_TICK_BANDWIDTH_BPS,
} from './constants.js';
import type {
  CamelotPool,
  ClmmAction,
  DecisionContext,
  PositionSnapshot,
  PriceRange,
  WalletPosition,
} from './types.js';

const LOG_BASE = Math.log(1.0001);

export function deriveMidPrice(pool: CamelotPool) {
  const decimalsDiff = pool.token0.decimals - pool.token1.decimals;
  const rawPrice = Math.exp(pool.tick * LOG_BASE);
  const adjustment = Math.pow(10, decimalsDiff);
  return rawPrice * adjustment;
}

export function computeVolatilityPct(currentPrice: number, previousPrice?: number) {
  if (!previousPrice || previousPrice <= 0) {
    return 0;
  }
  return (Math.abs(currentPrice - previousPrice) / previousPrice) * 100;
}

function priceToTick(price: number, decimalsDiff: number) {
  if (price <= 0) {
    return 0;
  }
  const adjustedPrice = price / Math.pow(10, decimalsDiff);
  return Math.round(Math.log(adjustedPrice) / LOG_BASE);
}

function tickToPrice(tick: number, decimalsDiff: number) {
  const ratio = Math.exp(tick * LOG_BASE);
  return ratio * Math.pow(10, decimalsDiff);
}

function snapTick(tick: number, spacing: number) {
  const remainder = tick % spacing;
  if (remainder === 0) {
    return tick;
  }
  return tick - remainder;
}

export function buildRange(
  midPrice: number,
  bandwidthBps: number,
  tickSpacing: number,
  decimalsDiff: number,
): PriceRange {
  const pct = bandwidthBps / 10_000;
  const lowerPrice = midPrice * (1 - pct);
  const upperPrice = midPrice * (1 + pct);
  const lowerTick = snapTick(priceToTick(lowerPrice, decimalsDiff), tickSpacing);
  const upperTick = snapTick(priceToTick(upperPrice, decimalsDiff), tickSpacing);

  return {
    lowerTick,
    upperTick,
    lowerPrice: tickToPrice(lowerTick, decimalsDiff),
    upperPrice: tickToPrice(upperTick, decimalsDiff),
    bandwidthBps,
  };
}

function shouldExit(pool: CamelotPool) {
  const tvl = pool.activeTvlUSD ?? 0;
  return tvl < DEFAULT_MIN_TVL_USD * 0.2;
}

function shouldCompound({
  autoCompoundFees,
  estimatedFeeValueUsd,
  estimatedGasCostUsd,
}: DecisionContext) {
  if (!autoCompoundFees) {
    return false;
  }
  if (!estimatedFeeValueUsd || estimatedFeeValueUsd <= 0 || estimatedGasCostUsd <= 0) {
    return false;
  }
  const ratio = estimatedGasCostUsd / estimatedFeeValueUsd;
  return ratio <= AUTO_COMPOUND_COST_RATIO;
}

export function estimateFeeValueUsd(
  position: PositionSnapshot | undefined,
  pool: CamelotPool,
): number {
  if (!position) {
    return 0;
  }
  const amount0 = Number(
    formatUnits(position.tokensOwed0, pool.token0.decimals),
  );
  const amount1 = Number(
    formatUnits(position.tokensOwed1, pool.token1.decimals),
  );
  const token0Usd = pool.token0.usdPrice ?? 0;
  const token1Usd = pool.token1.usdPrice ?? 0;
  return amount0 * token0Usd + amount1 * token1Usd;
}

export function evaluateDecision(ctx: DecisionContext): ClmmAction {
  const decimalsDiff = ctx.pool.token0.decimals - ctx.pool.token1.decimals;
  const bandwidthBps =
    ctx.tickBandwidthBps ??
    (ctx.volatilityPct >= 1.0 ? VOLATILE_TICK_BANDWIDTH_BPS : DEFAULT_TICK_BANDWIDTH_BPS);
  const targetRange = buildRange(ctx.midPrice, bandwidthBps, ctx.pool.tickSpacing, decimalsDiff);

  if (shouldExit(ctx.pool)) {
    return {
      kind: 'exit-range',
      reason: 'Pool TVL below safety threshold',
    };
  }

  if (!ctx.position) {
    return {
      kind: 'enter-range',
      reason: 'No active CLMM position detected for this pool',
      targetRange,
    };
  }

  const width = ctx.position.tickUpper - ctx.position.tickLower;
  const innerWidth = Math.round(width * (ctx.rebalanceThresholdPct ?? DEFAULT_REBALANCE_THRESHOLD_PCT));
  const padding = Math.max(1, Math.floor((width - innerWidth) / 2));
  const innerLower = ctx.position.tickLower + padding;
  const innerUpper = ctx.position.tickUpper - padding;
  const currentTick = ctx.pool.tick;

  if (currentTick <= innerLower || currentTick >= innerUpper) {
    return {
      kind: 'adjust-range',
      reason: 'Price drifted outside the 60% inner safety band',
      targetRange,
    };
  }

  if (ctx.cyclesSinceRebalance >= ctx.maxIdleCycles) {
    return {
      kind: 'adjust-range',
      reason: 'Safety net triggered max idle cycles without rebalance',
      targetRange,
    };
  }

  const feeValueUsd =
    ctx.estimatedFeeValueUsd ?? estimateFeeValueUsd(ctx.position, ctx.pool);

  if (
    shouldCompound({
      ...ctx,
      estimatedFeeValueUsd: feeValueUsd,
    })
  ) {
    return {
      kind: 'compound-fees',
      reason: 'Auto-compound rule satisfied (fees exceed 1% gas threshold)',
    };
  }

  return {
    kind: 'hold',
    reason: 'Within target band and safety timers; monitoring continues',
  };
}

export function normalizePosition(raw: WalletPosition): PositionSnapshot {
  return {
    poolAddress: raw.poolAddress,
    tickLower: raw.tickLower,
    tickUpper: raw.tickUpper,
    liquidity: BigInt(raw.liquidity),
    tokensOwed0: BigInt(raw.tokensOwed0 ?? '0'),
    tokensOwed1: BigInt(raw.tokensOwed1 ?? '0'),
  };
}
