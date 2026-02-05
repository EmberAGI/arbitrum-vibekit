import { describe, expect, it } from 'vitest';

import type { AlloraPrediction } from '../domain/types.js';

import { decideTradeAction } from './decision.js';

describe('decideTradeAction', () => {
  it('opens a position when confidence meets threshold and no cooldown is active', () => {
    const prediction: AlloraPrediction = {
      topic: 'BTC/USD - Price Prediction - 8h',
      horizonHours: 8,
      confidence: 0.8,
      direction: 'up',
      predictedPrice: 110,
      timestamp: '2026-02-05T12:00:00.000Z',
    };

    const decision = decideTradeAction({
      prediction,
      decisionThreshold: 0.62,
      cooldownRemaining: 0,
      maxLeverage: 2,
      baseContributionUsd: 100,
      previousAction: undefined,
      previousSide: undefined,
    });

    expect(decision).toEqual({
      action: 'open',
      side: 'long',
      leverage: 2,
      sizeUsd: 80,
      reason: 'Signal confidence 0.8 >= 0.62; opening long position.',
    });
  });
});
