import { describe, expect, it } from 'vitest';

import type { AccountingState } from '../accounting/types.js';

import type { ClmmMetrics, ClmmProfile } from './context.js';
import { applyAccountingToView } from './viewMapping.js';

const buildAccounting = (overrides: Partial<AccountingState> = {}): AccountingState => ({
  navSnapshots: [],
  flowLog: [
    {
      id: 'flow-1',
      type: 'supply',
      timestamp: new Date(0).toISOString(),
      contextId: 'ctx-1',
      chainId: 42161,
      poolAddress: '0xpool1',
    },
  ],
  latestNavSnapshot: {
    contextId: 'ctx-1',
    trigger: 'cycle',
    timestamp: new Date(0).toISOString(),
    protocolId: 'camelot',
    walletAddress: '0x0000000000000000000000000000000000000000',
    chainId: 42161,
    totalUsd: 12,
    positions: [],
    feesUsd: 1.2,
    feesApy: 75,
    priceSource: 'ember',
    cycle: 4,
  },
  aumUsd: 12,
  apy: 1.25,
  lifetimePnlUsd: 3.5,
  ...overrides,
});

const baseProfile: ClmmProfile = {
  agentIncome: undefined,
  aum: undefined,
  totalUsers: undefined,
  apy: undefined,
  chains: [],
  protocols: [],
  tokens: [],
  pools: [],
  allowedPools: [],
};

const baseMetrics: ClmmMetrics = {
  lastSnapshot: {
    address: '0xpool1',
    token0: { address: '0xt0', symbol: 'AAA', decimals: 18 },
    token1: { address: '0xt1', symbol: 'BBB', decimals: 6 },
    tickSpacing: 10,
    tick: 0,
    liquidity: '0',
  },
  previousPrice: undefined,
  cyclesSinceRebalance: 0,
  staleCycles: 0,
  iteration: 0,
  latestCycle: undefined,
};

describe('applyAccountingToView', () => {
  it('maps accounting AUM/APY and iteration into profile/metrics', () => {
    const accounting = buildAccounting();

  const { profile, metrics } = applyAccountingToView({
    profile: baseProfile,
    metrics: baseMetrics,
    accounting,
  });

  expect(profile.aum).toBe(12);
  expect(profile.apy).toBe(1.25);
  expect(profile.agentIncome).toBe(3.5);
  expect(metrics.iteration).toBe(4);
  expect(metrics.aumUsd).toBe(12);
    expect(metrics.apy).toBe(75);
  expect(metrics.lifetimePnlUsd).toBe(3.5);
  expect(metrics.latestSnapshot?.totalUsd).toBe(12);
});

it('overwrites agent income with accounting lifetime PnL', () => {
  const accounting = buildAccounting({ lifetimePnlUsd: 99 });
  const { profile } = applyAccountingToView({
    profile: { ...baseProfile, agentIncome: 42 },
    metrics: baseMetrics,
    accounting,
  });

  expect(profile.agentIncome).toBe(99);
});
});
