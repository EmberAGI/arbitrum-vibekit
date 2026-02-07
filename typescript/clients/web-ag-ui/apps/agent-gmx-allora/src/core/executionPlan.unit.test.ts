import { describe, expect, it } from 'vitest';

import type { GmxAlloraTelemetry } from '../domain/types.js';

import { buildPerpetualExecutionPlan } from './executionPlan.js';

describe('buildPerpetualExecutionPlan', () => {
  it('builds a long request for open long actions', () => {
    const telemetry: GmxAlloraTelemetry = {
      cycle: 1,
      action: 'open',
      reason: 'Signal strong',
      marketSymbol: 'BTC/USDC',
      side: 'long',
      leverage: 2,
      sizeUsd: 160,
      timestamp: '2026-02-05T12:00:00.000Z',
    };

    const plan = buildPerpetualExecutionPlan({
      telemetry,
      chainId: '42161',
      marketAddress: '0xmarket',
      walletAddress: '0xwallet',
      payTokenAddress: '0xusdc',
      collateralTokenAddress: '0xusdc',
    });

    expect(plan.action).toBe('long');
    expect(plan.request).toEqual({
      amount: '160',
      walletAddress: '0xwallet',
      chainId: '42161',
      marketAddress: '0xmarket',
      payTokenAddress: '0xusdc',
      collateralTokenAddress: '0xusdc',
      leverage: '2',
    });
  });

  it('builds a close request for reduce actions', () => {
    const telemetry: GmxAlloraTelemetry = {
      cycle: 2,
      action: 'reduce',
      reason: 'Reduce exposure',
      marketSymbol: 'ETH/USDC',
      side: 'short',
      leverage: 2,
      sizeUsd: 120,
      timestamp: '2026-02-05T12:05:00.000Z',
    };

    const plan = buildPerpetualExecutionPlan({
      telemetry,
      chainId: '42161',
      marketAddress: '0xmarket',
      walletAddress: '0xwallet',
      payTokenAddress: '0xusdc',
      collateralTokenAddress: '0xusdc',
    });

    expect(plan.action).toBe('close');
    expect(plan.request).toEqual({
      walletAddress: '0xwallet',
      marketAddress: '0xmarket',
      positionSide: 'short',
      isLimit: false,
    });
  });
});
