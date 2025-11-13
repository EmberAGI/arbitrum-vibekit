import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MIN_TVL_USD,
  DEFAULT_REBALANCE_THRESHOLD_PCT,
  DEFAULT_TICK_BANDWIDTH_BPS,
} from './constants.js';
import {
  buildRange,
  computeVolatilityPct,
  deriveMidPrice,
  estimateFeeValueUsd,
  evaluateDecision,
  normalizePosition,
} from './decision-engine.js';
import type { CamelotPool, DecisionContext, PositionSnapshot, WalletPosition } from './types.js';

const LOG_BASE = Math.log(1.0001);

function tickForPrice(price: number, decimalsDiff: number) {
  const adjusted = price / Math.pow(10, decimalsDiff);
  return Math.round(Math.log(adjusted) / LOG_BASE);
}

function makePool(overrides: Partial<CamelotPool> = {}): CamelotPool {
  return {
    address: '0xpool',
    token0: { address: '0xweth', symbol: 'WETH', decimals: 18, usdPrice: 2000 },
    token1: { address: '0xusdc', symbol: 'USDC', decimals: 6, usdPrice: 1 },
    tickSpacing: 60,
    tick: tickForPrice(2000, 12),
    liquidity: '1',
    activeTvlUSD: DEFAULT_MIN_TVL_USD * 2,
    ...overrides,
  };
}

function makeContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  const pool = overrides.pool ?? makePool();
  return {
    pool,
    position: overrides.position,
    midPrice: overrides.midPrice ?? deriveMidPrice(pool),
    volatilityPct: overrides.volatilityPct ?? 0,
    cyclesSinceRebalance: overrides.cyclesSinceRebalance ?? 0,
    tickBandwidthBps: overrides.tickBandwidthBps ?? DEFAULT_TICK_BANDWIDTH_BPS,
    rebalanceThresholdPct: overrides.rebalanceThresholdPct ?? DEFAULT_REBALANCE_THRESHOLD_PCT,
    maxIdleCycles: overrides.maxIdleCycles ?? 10,
    autoCompoundFees: overrides.autoCompoundFees ?? true,
    estimatedFeeValueUsd: overrides.estimatedFeeValueUsd,
    estimatedGasCostUsd: overrides.estimatedGasCostUsd ?? 10,
  };
}

describe('deriveMidPrice', () => {
  it('derives the implied price from ticks and decimal differences', () => {
    // Given a pool whose tick encodes a ~2000 USD WETH price
    const pool = makePool();

    // When deriveMidPrice runs
    const price = deriveMidPrice(pool);

    // Then it should closely mirror the ratio encoded in the tick metadata
    expect(price).toBeGreaterThan(1999);
    expect(price).toBeLessThan(2001);
  });
});

describe('buildRange', () => {
  it('snaps computed ticks to the pool tick spacing', () => {
    // Given a mid price and target bandwidth
    const range = buildRange(100, 100, 60, 0);

    // Then the resulting tick boundaries should align with spacing increments
    expect(range.lowerTick % 60).toBe(0);
    expect(range.upperTick % 60).toBe(0);
    expect(range.upperTick).toBeGreaterThan(range.lowerTick);
  });
});

describe('evaluateDecision', () => {
  it('requests an exit when TVL falls below the safety floor', () => {
    // Given a dangerously illiquid pool
    const pool = makePool({ activeTvlUSD: DEFAULT_MIN_TVL_USD * 0.1 });
    const action = evaluateDecision(makeContext({ pool }));

    // Then the decision engine should cut exposure immediately
    expect(action.kind).toBe('exit-range');
    expect(action.reason).toMatch(/safety threshold/i);
  });

  it('enters a range when no position is active', () => {
    // Given no wallet position for the pool
    const action = evaluateDecision(makeContext({ position: undefined }));

    // Then the engine should prepare an entry plan with a target range
    expect(action.kind).toBe('enter-range');
    expect(action.targetRange).toBeDefined();
  });

  it('adjusts ranges when price drifts outside the inner safety band', () => {
    // Given a position whose current tick sits outside the inner band
    const pool = makePool({ tick: tickForPrice(2100, 12) });
    const position: PositionSnapshot = {
      poolAddress: pool.address,
      tickLower: tickForPrice(1800, 12),
      tickUpper: tickForPrice(2200, 12),
    };
    const action = evaluateDecision(
      makeContext({
        pool,
        position,
        rebalanceThresholdPct: 0.5,
      }),
    );

    // Then the engine should call for an adjustment with a refreshed target range
    expect(action.kind).toBe('adjust-range');
    expect(action.targetRange).toBeDefined();
  });

  it('forces an adjustment after exceeding the idle cycle safety net', () => {
    // Given a pool that stayed within range but hit the idle cycle cap
    const pool = makePool();
    const position: PositionSnapshot = {
      poolAddress: pool.address,
      tickLower: pool.tick - 120,
      tickUpper: pool.tick + 120,
    };
    const action = evaluateDecision(
      makeContext({
        pool,
        position,
        cyclesSinceRebalance: 11,
        maxIdleCycles: 10,
      }),
    );

    // Then the engine should still demand an adjustment to refresh liquidity
    expect(action.kind).toBe('adjust-range');
    expect(action.reason).toMatch(/Safety net/i);
  });

  it('compounds fees when auto-compound is enabled and gas ratio is favorable', () => {
    // Given accumulated fees that dwarf the projected gas spend
    const pool = makePool();
    const position: PositionSnapshot = {
      poolAddress: pool.address,
      tickLower: pool.tick - 60,
      tickUpper: pool.tick + 60,
    };
    const action = evaluateDecision(
      makeContext({
        pool,
        position,
        estimatedFeeValueUsd: 500,
        estimatedGasCostUsd: 1,
        autoCompoundFees: true,
      }),
    );

    // Then the engine should request a compound-fees action
    expect(action.kind).toBe('compound-fees');
  });

  it('holds position when inside the target band and timers are satisfied', () => {
    // Given a healthy pool + position configuration
    const pool = makePool();
    const position: PositionSnapshot = {
      poolAddress: pool.address,
      tickLower: pool.tick - 120,
      tickUpper: pool.tick + 120,
    };
    const action = evaluateDecision(
      makeContext({
        pool,
        position,
        autoCompoundFees: false,
      }),
    );

    // Then the engine should remain in monitoring mode
    expect(action.kind).toBe('hold');
  });
});

describe('estimateFeeValueUsd', () => {
  it('sums owed tokens using each token USD price', () => {
    // Given a position with accrued fees
    const pool = makePool();
    const snapshot: PositionSnapshot = {
      poolAddress: pool.address,
      tickLower: pool.tick - 60,
      tickUpper: pool.tick + 60,
      tokensOwed0: 2000000000000000000n, // 2 WETH
      tokensOwed1: 5_000_000n, // 5 USDC (6 decimals)
    };

    // When estimating the USD value of the fees
    const usdValue = estimateFeeValueUsd(snapshot, pool);

    // Then the helper should multiply each token amount by its USD price
    expect(usdValue).toBeCloseTo(4005, 3);
  });
});

describe('normalizePosition', () => {
  it('converts raw wallet position fields into bigint snapshots', () => {
    // Given a wallet position payload from the Ember API
    const raw: WalletPosition = {
      poolAddress: '0xpool',
      operator: '0xop',
      tickLower: -120,
      tickUpper: 120,
      liquidity: '5000',
      tokensOwed0: '100',
      tokensOwed1: '200',
    };

    // When normalizePosition processes it
    const normalized = normalizePosition(raw);

    // Then numeric string payloads should become bigint-friendly metadata
    expect(normalized.liquidity).toBe(5000n);
    expect(normalized.tokensOwed0).toBe(100n);
    expect(normalized.tokensOwed1).toBe(200n);
  });
});

describe('computeVolatilityPct', () => {
  it('returns zero when no prior price exists and absolute delta otherwise', () => {
    // Given no previous price sample
    expect(computeVolatilityPct(2000)).toBe(0);

    // When subsequent samples arrive
    const pct = computeVolatilityPct(2100, 2000);

    // Then the helper should return the absolute percent change
    expect(pct).toBeCloseTo(5, 5);
  });
});
