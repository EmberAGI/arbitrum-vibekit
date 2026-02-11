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

  it('builds a reduce request for reduce actions', () => {
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
      positionContractKey: '0xposition',
      positionSizeInUsd: '2000000000000000000000000000000',
    });

    expect(plan.action).toBe('reduce');
    expect(plan.request).toEqual({
      walletAddress: '0xwallet',
      key: '0xposition',
      sizeDeltaUsd: '1000000000000000000000000000000',
    });
  });

  it('builds a short request for open short actions', () => {
    const telemetry: GmxAlloraTelemetry = {
      cycle: 3,
      action: 'open',
      reason: 'Signal bearish',
      marketSymbol: 'BTC/USDC',
      side: 'short',
      leverage: 2,
      sizeUsd: 180,
      timestamp: '2026-02-05T12:10:00.000Z',
    };

    const plan = buildPerpetualExecutionPlan({
      telemetry,
      chainId: '42161',
      marketAddress: '0xmarket',
      walletAddress: '0xwallet',
      payTokenAddress: '0xusdc',
      collateralTokenAddress: '0xusdc',
    });

    expect(plan.action).toBe('short');
    expect(plan.request).toEqual({
      amount: '180',
      walletAddress: '0xwallet',
      chainId: '42161',
      marketAddress: '0xmarket',
      payTokenAddress: '0xusdc',
      collateralTokenAddress: '0xusdc',
      leverage: '2',
    });
  });

  it('builds a close request for close actions', () => {
    const telemetry: GmxAlloraTelemetry = {
      cycle: 4,
      action: 'close',
      reason: 'Direction flipped',
      marketSymbol: 'BTC/USDC',
      side: 'short',
      leverage: 2,
      sizeUsd: 180,
      timestamp: '2026-02-05T12:15:00.000Z',
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

  it('returns none when required telemetry fields are missing', () => {
    const openWithoutSide: GmxAlloraTelemetry = {
      cycle: 5,
      action: 'open',
      reason: 'Incomplete telemetry',
      marketSymbol: 'BTC/USDC',
      timestamp: '2026-02-05T12:20:00.000Z',
    };
    const closeWithoutSide: GmxAlloraTelemetry = {
      cycle: 6,
      action: 'close',
      reason: 'Missing side',
      marketSymbol: 'BTC/USDC',
      timestamp: '2026-02-05T12:25:00.000Z',
    };

    const openPlan = buildPerpetualExecutionPlan({
      telemetry: openWithoutSide,
      chainId: '42161',
      marketAddress: '0xmarket',
      walletAddress: '0xwallet',
      payTokenAddress: '0xusdc',
      collateralTokenAddress: '0xusdc',
    });
    const closePlan = buildPerpetualExecutionPlan({
      telemetry: closeWithoutSide,
      chainId: '42161',
      marketAddress: '0xmarket',
      walletAddress: '0xwallet',
      payTokenAddress: '0xusdc',
      collateralTokenAddress: '0xusdc',
    });

    expect(openPlan).toEqual({ action: 'none' });
    expect(closePlan).toEqual({ action: 'none' });
  });
});
