import { describe, expect, it } from 'vitest';

import type { AlloraPrediction } from '../domain/types.js';

import { buildCycleTelemetry } from './cycle.js';

describe('buildCycleTelemetry', () => {
  it('returns cooldown telemetry and increments cycles since trade', () => {
    const prediction: AlloraPrediction = {
      topic: 'ETH/USD - Price Prediction - 8h',
      horizonHours: 8,
      confidence: 0.75,
      direction: 'down',
      predictedPrice: 2400,
      timestamp: '2026-02-05T12:00:00.000Z',
    };

    const result = buildCycleTelemetry({
      prediction,
      decisionThreshold: 0.62,
      cooldownCycles: 2,
      baseContributionUsd: 100,
      maxLeverage: 2,
      previousAction: 'open',
      previousSide: 'long',
      cyclesSinceTrade: 1,
      isFirstCycle: false,
      iteration: 4,
      marketSymbol: 'ETH/USDC',
      now: new Date('2026-02-05T12:01:00.000Z'),
    });

    expect(result.telemetry).toEqual({
      cycle: 4,
      action: 'cooldown',
      reason: 'Cooldown active for 1 more cycle(s).',
      marketSymbol: 'ETH/USDC',
      prediction,
      timestamp: '2026-02-05T12:01:00.000Z',
      metrics: {
        confidence: 0.75,
        decisionThreshold: 0.62,
        cooldownRemaining: 1,
      },
    });
    expect(result.nextCyclesSinceTrade).toBe(2);
  });

  it('opens with capped leverage and safety buffer sizing when signal is strong', () => {
    const prediction: AlloraPrediction = {
      topic: 'BTC/USD - Price Prediction - 8h',
      horizonHours: 8,
      confidence: 0.81,
      direction: 'up',
      predictedPrice: 47000,
      timestamp: '2026-02-05T12:00:00.000Z',
    };

    const result = buildCycleTelemetry({
      prediction,
      decisionThreshold: 0.62,
      cooldownCycles: 2,
      baseContributionUsd: 200,
      maxLeverage: 4,
      previousAction: undefined,
      previousSide: undefined,
      cyclesSinceTrade: 3,
      isFirstCycle: false,
      iteration: 2,
      marketSymbol: 'BTC/USDC',
      now: new Date('2026-02-05T12:02:00.000Z'),
    });

    expect(result.telemetry).toEqual({
      cycle: 2,
      action: 'open',
      reason: 'Signal confidence 0.81 >= 0.62; opening long position.',
      marketSymbol: 'BTC/USDC',
      side: 'long',
      leverage: 2,
      sizeUsd: 160,
      prediction,
      timestamp: '2026-02-05T12:02:00.000Z',
      metrics: {
        confidence: 0.81,
        decisionThreshold: 0.62,
        cooldownRemaining: 0,
      },
    });
    expect(result.nextCyclesSinceTrade).toBe(0);
  });
});
