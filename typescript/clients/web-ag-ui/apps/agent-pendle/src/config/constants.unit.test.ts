import { describe, expect, it } from 'vitest';

import {
  resolvePendleChainIds,
  resolvePollIntervalMs,
  resolveRebalanceThresholdPct,
  resolveStablecoinWhitelist,
  resolveStateHistoryLimit,
  resolveStreamLimit,
} from './constants.js';

describe('config/constants', () => {
  it('uses defaults when env vars are missing or invalid', () => {
    delete process.env.PENDLE_CHAIN_IDS;
    delete process.env.PENDLE_POLL_INTERVAL_MS;
    delete process.env.PENDLE_REBALANCE_THRESHOLD_PCT;
    delete process.env.PENDLE_STABLECOIN_WHITELIST;
    delete process.env.PENDLE_STREAM_LIMIT;
    delete process.env.PENDLE_STATE_HISTORY_LIMIT;

    expect(resolvePendleChainIds()).toEqual(['42161']);
    expect(resolvePollIntervalMs()).toBe(3_600_000);
    expect(resolveRebalanceThresholdPct()).toBe(0.5);
    expect(resolveStablecoinWhitelist().length).toBeGreaterThan(0);
    expect(resolveStreamLimit()).toBe(-1);
    expect(resolveStateHistoryLimit()).toBe(100);
  });

  it('parses override values from env', () => {
    process.env.PENDLE_CHAIN_IDS = '1, 42161';
    process.env.PENDLE_POLL_INTERVAL_MS = '6000';
    process.env.PENDLE_REBALANCE_THRESHOLD_PCT = '1.25';
    process.env.PENDLE_STABLECOIN_WHITELIST = 'USDe,USDai';
    process.env.PENDLE_STREAM_LIMIT = '42';
    process.env.PENDLE_STATE_HISTORY_LIMIT = '55';

    expect(resolvePendleChainIds()).toEqual(['1', '42161']);
    expect(resolvePollIntervalMs()).toBe(6_000);
    expect(resolveRebalanceThresholdPct()).toBe(1.25);
    expect(resolveStablecoinWhitelist()).toEqual(['USDe', 'USDai']);
    expect(resolveStreamLimit()).toBe(42);
    expect(resolveStateHistoryLimit()).toBe(55);
  });
});
