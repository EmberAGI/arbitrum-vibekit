/**
 * Scanner Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { scanForOpportunities } from '../../src/strategy/scanner.js';
import type { Market, StrategyConfig } from '../../src/workflow/context.js';

const defaultConfig: StrategyConfig = {
  minSpreadThreshold: 0.02,
  minPositionSizeUsd: 1,
  maxPositionSizeUsd: 100,
  portfolioRiskPct: 3,
  pollIntervalMs: 30000,
  maxTotalExposureUsd: 500,
  minShareSize: 5,
};

describe('scanForOpportunities', () => {
  it('should find opportunity when YES + NO < 1.0 - threshold', () => {
    const markets: Market[] = [
      {
        id: 'market-1',
        title: 'Test Market',
        yesTokenId: 'yes-token-1',
        noTokenId: 'no-token-1',
        yesPrice: 0.45,
        noPrice: 0.52, // Total: 0.97, spread: 0.03
        volume: 10000,
        liquidity: 5000,
        endDate: '2026-12-31',
        resolved: false,
        active: true,
      },
    ];

    const opportunities = scanForOpportunities(markets, defaultConfig);

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]?.spread).toBeCloseTo(0.03);
    expect(opportunities[0]?.marketId).toBe('market-1');
  });

  it('should not find opportunity when spread is below threshold', () => {
    const markets: Market[] = [
      {
        id: 'market-1',
        title: 'Test Market',
        yesTokenId: 'yes-token-1',
        noTokenId: 'no-token-1',
        yesPrice: 0.49,
        noPrice: 0.50, // Total: 0.99, spread: 0.01
        volume: 10000,
        liquidity: 5000,
        endDate: '2026-12-31',
        resolved: false,
        active: true,
      },
    ];

    const opportunities = scanForOpportunities(markets, defaultConfig);

    expect(opportunities).toHaveLength(0);
  });

  it('should skip resolved markets', () => {
    const markets: Market[] = [
      {
        id: 'market-1',
        title: 'Resolved Market',
        yesTokenId: 'yes-token-1',
        noTokenId: 'no-token-1',
        yesPrice: 0.40,
        noPrice: 0.40, // Great spread but resolved
        volume: 10000,
        liquidity: 5000,
        endDate: '2026-12-31',
        resolved: true,
        active: true,
      },
    ];

    const opportunities = scanForOpportunities(markets, defaultConfig);

    expect(opportunities).toHaveLength(0);
  });

  it('should skip inactive markets', () => {
    const markets: Market[] = [
      {
        id: 'market-1',
        title: 'Inactive Market',
        yesTokenId: 'yes-token-1',
        noTokenId: 'no-token-1',
        yesPrice: 0.40,
        noPrice: 0.40,
        volume: 10000,
        liquidity: 5000,
        endDate: '2026-12-31',
        resolved: false,
        active: false,
      },
    ];

    const opportunities = scanForOpportunities(markets, defaultConfig);

    expect(opportunities).toHaveLength(0);
  });

  it('should sort opportunities by profit potential', () => {
    const markets: Market[] = [
      {
        id: 'market-1',
        title: 'Small Spread',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        yesPrice: 0.47,
        noPrice: 0.50, // spread: 0.03
        volume: 10000,
        liquidity: 5000,
        endDate: '2026-12-31',
        resolved: false,
        active: true,
      },
      {
        id: 'market-2',
        title: 'Large Spread',
        yesTokenId: 'yes-2',
        noTokenId: 'no-2',
        yesPrice: 0.40,
        noPrice: 0.50, // spread: 0.10
        volume: 10000,
        liquidity: 5000,
        endDate: '2026-12-31',
        resolved: false,
        active: true,
      },
    ];

    const opportunities = scanForOpportunities(markets, defaultConfig);

    expect(opportunities).toHaveLength(2);
    expect(opportunities[0]?.marketId).toBe('market-2'); // Larger spread first
    expect(opportunities[1]?.marketId).toBe('market-1');
  });
});
