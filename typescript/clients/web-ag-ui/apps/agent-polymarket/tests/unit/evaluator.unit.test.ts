/**
 * Evaluator Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { calculatePositionSize, isPositionViable } from '../../src/strategy/evaluator.js';
import type { ArbitrageOpportunity, StrategyConfig } from '../../src/workflow/context.js';

const defaultConfig: StrategyConfig = {
  minSpreadThreshold: 0.02,
  maxPositionSizeUsd: 100,
  portfolioRiskPct: 3,
  pollIntervalMs: 30000,
  maxTotalExposureUsd: 500,
};

const sampleOpportunity: ArbitrageOpportunity = {
  marketId: 'market-1',
  marketTitle: 'Test Market',
  yesTokenId: 'yes-token-1',
  noTokenId: 'no-token-1',
  yesPrice: 0.45,
  noPrice: 0.52,
  spread: 0.03,
  profitPotential: 0.03,
  timestamp: new Date().toISOString(),
};

describe('calculatePositionSize', () => {
  it('should calculate correct shares for equal dollar split', () => {
    const position = calculatePositionSize(sampleOpportunity, 1000, defaultConfig);

    expect(position).not.toBeNull();
    expect(position!.yesShares).toBeGreaterThan(0);
    expect(position!.noShares).toBeGreaterThan(0);
    expect(position!.totalCostUsd).toBeLessThanOrEqual(defaultConfig.maxPositionSizeUsd);
  });

  it('should cap position at maxPositionSizeUsd', () => {
    const position = calculatePositionSize(sampleOpportunity, 10000, defaultConfig);

    expect(position).not.toBeNull();
    expect(position!.totalCostUsd).toBeLessThanOrEqual(defaultConfig.maxPositionSizeUsd);
  });

  it('should return null for tiny portfolios', () => {
    const position = calculatePositionSize(sampleOpportunity, 10, {
      ...defaultConfig,
      maxPositionSizeUsd: 1,
    });

    expect(position).toBeNull();
  });

  it('should calculate expected profit correctly', () => {
    const position = calculatePositionSize(sampleOpportunity, 1000, defaultConfig);

    expect(position).not.toBeNull();
    expect(position!.expectedProfitUsd).toBeGreaterThan(0);
    expect(position!.roi).toBeGreaterThan(0);
  });
});

describe('isPositionViable', () => {
  it('should return true for viable positions', () => {
    const position = {
      yesShares: 10,
      noShares: 10,
      yesCostUsd: 4.5,
      noCostUsd: 5.2,
      totalCostUsd: 9.7,
      expectedProfitUsd: 0.3,
      roi: 0.03,
    };

    expect(isPositionViable(position)).toBe(true);
  });

  it('should return false for zero shares', () => {
    const position = {
      yesShares: 0,
      noShares: 10,
      yesCostUsd: 0,
      noCostUsd: 5.2,
      totalCostUsd: 5.2,
      expectedProfitUsd: 0.1,
      roi: 0.02,
    };

    expect(isPositionViable(position)).toBe(false);
  });

  it('should return false for negative profit', () => {
    const position = {
      yesShares: 10,
      noShares: 10,
      yesCostUsd: 5,
      noCostUsd: 5,
      totalCostUsd: 10,
      expectedProfitUsd: -0.1,
      roi: -0.01,
    };

    expect(isPositionViable(position)).toBe(false);
  });
});
