import { describe, expect, it } from 'vitest';

import type { PendleYieldToken } from '../domain/types.js';

import { evaluateRebalanceDecision, rankYieldTokens } from './pendleDecision.js';

const token = (overrides: Partial<PendleYieldToken>): PendleYieldToken => ({
  marketAddress: '0x0000000000000000000000000000000000000001',
  ytSymbol: 'YT-USD',
  underlyingSymbol: 'USD',
  apy: 5,
  maturity: '2030-01-01',
  ...overrides,
});

describe('rankYieldTokens', () => {
  it('orders by apy desc, then ytSymbol, then marketAddress', () => {
    const input: PendleYieldToken[] = [
      token({ marketAddress: '0x0000000000000000000000000000000000000002', ytSymbol: 'YT-B', apy: 7 }),
      token({ marketAddress: '0x0000000000000000000000000000000000000003', ytSymbol: 'YT-A', apy: 7 }),
      token({ marketAddress: '0x0000000000000000000000000000000000000001', ytSymbol: 'YT-A', apy: 7 }),
      token({ marketAddress: '0x0000000000000000000000000000000000000004', ytSymbol: 'YT-C', apy: 5 }),
    ];

    const sorted = rankYieldTokens(input);

    expect(sorted.map((entry) => entry.marketAddress)).toEqual([
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000003',
      '0x0000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000004',
    ]);

    expect(input.map((entry) => entry.marketAddress)).toEqual([
      '0x0000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000003',
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000004',
    ]);
  });
});

describe('evaluateRebalanceDecision', () => {
  it('rebalances when apy delta meets threshold', () => {
    const current = token({ ytSymbol: 'YT-OLD', apy: 5 });
    const best = token({ ytSymbol: 'YT-NEW', apy: 5.5 });

    const decision = evaluateRebalanceDecision({
      bestToken: best,
      currentToken: current,
      thresholdPct: 0.5,
    });

    expect(decision.shouldRebalance).toBe(true);
    expect(decision.apyDelta).toBe(0.5);
    expect(decision.nextToken.marketAddress).toBe(best.marketAddress);
  });

  it('holds when apy delta is below threshold', () => {
    const current = token({ ytSymbol: 'YT-OLD', apy: 5 });
    const best = token({ ytSymbol: 'YT-NEW', apy: 5.4 });

    const decision = evaluateRebalanceDecision({
      bestToken: best,
      currentToken: current,
      thresholdPct: 0.5,
    });

    expect(decision.shouldRebalance).toBe(false);
    expect(decision.apyDelta).toBe(0.4);
    expect(decision.nextToken.marketAddress).toBe(current.marketAddress);
  });
});
