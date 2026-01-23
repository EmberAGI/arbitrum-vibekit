import { formatUnits } from 'viem';

import {
  AUTO_COMPOUND_COST_RATIO,
  DEFAULT_MIN_TVL_USD,
  DEFAULT_REBALANCE_THRESHOLD_PCT,
  VOLATILE_TICK_BANDWIDTH_BPS,
  resolveTickBandwidthBps,
} from '../config/constants.js';
import type {
  CamelotPool,
  ClmmAction,
  DecisionContext,
  PositionSnapshot,
  PriceRange,
  WalletPosition,
} from '../domain/types.js';

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

export function tickToPrice(tick: number, decimalsDiff: number) {
  const ratio = Math.exp(tick * LOG_BASE);
  return ratio * Math.pow(10, decimalsDiff);
}

function snapTickToSpacing(tick: number, spacing: number, mode: 'floor' | 'ceil' | 'round') {
  if (spacing <= 0) {
    return tick;
  }
  const normalized = tick / spacing;
  const snapped =
    mode === 'floor' ? Math.floor(normalized) : mode === 'ceil' ? Math.ceil(normalized) : Math.round(normalized);
  return snapped * spacing;
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
  const lowerTickEstimate = priceToTick(lowerPrice, decimalsDiff);
  const upperTickEstimate = priceToTick(upperPrice, decimalsDiff);
  const rawWidth = Math.max(tickSpacing, upperTickEstimate - lowerTickEstimate);
  let widthMultiple = Math.max(1, Math.round(rawWidth / tickSpacing));
  if (widthMultiple % 2 !== 0) {
    widthMultiple += 1;
  }
  const widthTicks = widthMultiple * tickSpacing;
  const centerTick = snapTickToSpacing(priceToTick(midPrice, decimalsDiff), tickSpacing, 'round');
  const halfWidth = Math.trunc(widthTicks / 2);
  const lowerTick = centerTick - halfWidth;
  const upperTick = centerTick + halfWidth;

  return {
    lowerTick,
    upperTick,
    lowerPrice: tickToPrice(lowerTick, decimalsDiff),
    upperPrice: tickToPrice(upperTick, decimalsDiff),
    bandwidthBps,
  };
}

function shouldExit(pool: CamelotPool) {
  const tvl = pool.activeTvlUSD;
  if (tvl === undefined || tvl === null) {
    return false;
  }
  return tvl < DEFAULT_MIN_TVL_USD * 0.2;
}

function shouldCompound({
  autoCompoundFees,
  estimatedFeeValueUsd,
  maxGasSpendUsd,
}: DecisionContext) {
  if (!autoCompoundFees) {
    return false;
  }
  if (!estimatedFeeValueUsd || estimatedFeeValueUsd <= 0 || maxGasSpendUsd <= 0) {
    return false;
  }
  const ratio = maxGasSpendUsd / estimatedFeeValueUsd;
  return ratio <= AUTO_COMPOUND_COST_RATIO;
}

export function estimateFeeValueUsd(
  position: PositionSnapshot | undefined,
  pool: CamelotPool,
): number {
  if (!position || (!position.tokensOwed0 && !position.tokensOwed1)) {
    return 0;
  }
  const amount0 = position.tokensOwed0
    ? Number(formatUnits(position.tokensOwed0, pool.token0.decimals))
    : 0;
  const amount1 = position.tokensOwed1
    ? Number(formatUnits(position.tokensOwed1, pool.token1.decimals))
    : 0;
  const token0Usd = pool.token0.usdPrice ?? 0;
  const token1Usd = pool.token1.usdPrice ?? 0;
  return amount0 * token0Usd + amount1 * token1Usd;
}

export function evaluateDecision(ctx: DecisionContext): ClmmAction {
  const decimalsDiff = ctx.pool.token0.decimals - ctx.pool.token1.decimals;
  const bandwidthBps =
    ctx.tickBandwidthBps ??
    (ctx.volatilityPct >= 1.0 ? VOLATILE_TICK_BANDWIDTH_BPS : resolveTickBandwidthBps());
  const targetRange = buildRange(ctx.midPrice, bandwidthBps, ctx.pool.tickSpacing, decimalsDiff);
  const exitUnsafePool = shouldExit(ctx.pool);

  if (!ctx.position) {
    if (exitUnsafePool) {
      return {
        kind: 'hold',
        reason: 'Pool TVL below safety threshold; waiting to redeploy',
      };
    }
    return {
      kind: 'enter-range',
      reason: 'No active CLMM position detected for this pool',
      targetRange,
    };
  }

  if (exitUnsafePool) {
    return {
      kind: 'exit-range',
      reason: 'Pool TVL below safety threshold',
    };
  }

  const minAllocationPct = ctx.minAllocationPct;
  const shouldEnforceAllocation =
    typeof minAllocationPct === 'number' && Number.isFinite(minAllocationPct) && minAllocationPct > 0;
  if (
    shouldEnforceAllocation &&
    typeof ctx.positionValueUsd === 'number' &&
    Number.isFinite(ctx.positionValueUsd) &&
    typeof ctx.targetAllocationUsd === 'number' &&
    Number.isFinite(ctx.targetAllocationUsd) &&
    ctx.targetAllocationUsd > 0
  ) {
    const allocationPct = (ctx.positionValueUsd / ctx.targetAllocationUsd) * 100;
    if (Number.isFinite(allocationPct) && allocationPct < minAllocationPct) {
      return {
        kind: 'exit-range',
        reason: `Position allocation ${allocationPct.toFixed(2)}% below minimum ${minAllocationPct.toFixed(2)}%`,
      };
    }
  }

  const width = ctx.position.tickUpper - ctx.position.tickLower;
  const rebalanceThresholdPct = ctx.rebalanceThresholdPct ?? DEFAULT_REBALANCE_THRESHOLD_PCT;
  const innerWidth = Math.round(width * rebalanceThresholdPct);
  const padding = Math.max(1, Math.floor((width - innerWidth) / 2));
  const innerLower = ctx.position.tickLower + padding;
  const innerUpper = ctx.position.tickUpper - padding;
  const currentTick = ctx.pool.tick;

  if (currentTick <= innerLower || currentTick >= innerUpper) {
    const innerBandPercent = Math.round(rebalanceThresholdPct * 100);
    return {
      kind: 'adjust-range',
      reason: `Price drifted outside the ${innerBandPercent}% inner safety band`,
      targetRange,
    };
  }

  const feeValueUsd = ctx.estimatedFeeValueUsd ?? estimateFeeValueUsd(ctx.position, ctx.pool);

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

  const targetWidth = targetRange.upperTick - targetRange.lowerTick;
  const positionWidth = ctx.position.tickUpper - ctx.position.tickLower;
  if (positionWidth !== targetWidth) {
    return {
      kind: 'exit-range',
      reason: 'Active range width differs from target bandwidth; exiting to refresh next cycle',
    };
  }

  return {
    kind: 'hold',
    reason: 'Within target band; monitoring continues',
  };
}

export function normalizePosition(raw: WalletPosition): PositionSnapshot {
  return {
    poolAddress: raw.poolAddress,
    tickLower: raw.tickLower,
    tickUpper: raw.tickUpper,
    liquidity: raw.liquidity ? BigInt(raw.liquidity) : undefined,
    tokensOwed0: raw.tokensOwed0 ? BigInt(raw.tokensOwed0) : undefined,
    tokensOwed1: raw.tokensOwed1 ? BigInt(raw.tokensOwed1) : undefined,
  };
}
