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

  it('opens a short position when the signal direction is down', () => {
    const prediction: AlloraPrediction = {
      topic: 'BTC/USD - Price Prediction - 8h',
      horizonHours: 8,
      confidence: 0.9,
      direction: 'down',
      predictedPrice: 90,
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
      side: 'short',
      leverage: 2,
      sizeUsd: 80,
      reason: 'Signal confidence 0.9 >= 0.62; opening short position.',
    });
  });

  it('holds when the configured allocation yields too small of a trade size', () => {
    const prediction: AlloraPrediction = {
      topic: 'BTC/USD - Price Prediction - 8h',
      horizonHours: 8,
      confidence: 0.9,
      direction: 'up',
      predictedPrice: 110,
      timestamp: '2026-02-05T12:00:00.000Z',
    };

    const decision = decideTradeAction({
      prediction,
      decisionThreshold: 0.62,
      cooldownRemaining: 0,
      maxLeverage: 2,
      baseContributionUsd: 1,
      previousAction: undefined,
      previousSide: undefined,
    });

    expect(decision.action).toBe('hold');
    expect(decision.reason).toContain('minimum');
  });

  it('opens when the computed trade size matches the minimum supported size', () => {
    const prediction: AlloraPrediction = {
      topic: 'BTC/USD - Price Prediction - 8h',
      horizonHours: 8,
      confidence: 0.9,
      direction: 'up',
      predictedPrice: 110,
      timestamp: '2026-02-05T12:00:00.000Z',
    };

    const decision = decideTradeAction({
      prediction,
      decisionThreshold: 0.62,
      cooldownRemaining: 0,
      maxLeverage: 2,
      // With the 20% safety buffer applied, this yields exactly $1.00.
      baseContributionUsd: 1.25,
      previousAction: undefined,
      previousSide: undefined,
    });

    expect(decision.action).toBe('open');
    expect(decision.sizeUsd).toBe(1);
  });

  it('holds when confidence is below threshold', () => {
    const prediction: AlloraPrediction = {
      topic: 'BTC/USD - Price Prediction - 8h',
      horizonHours: 8,
      confidence: 0.4,
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
      action: 'hold',
      reason: 'Signal confidence 0.4 below threshold 0.62; holding position.',
    });
  });

  it('closes when direction flips while a position is open', () => {
    const prediction: AlloraPrediction = {
      topic: 'BTC/USD - Price Prediction - 8h',
      horizonHours: 8,
      confidence: 0.9,
      direction: 'down',
      predictedPrice: 90,
      timestamp: '2026-02-05T12:00:00.000Z',
    };

    const decision = decideTradeAction({
      prediction,
      decisionThreshold: 0.62,
      cooldownRemaining: 0,
      maxLeverage: 2,
      baseContributionUsd: 100,
      previousAction: 'open',
      previousSide: 'long',
    });

    expect(decision.action).toBe('close');
    expect(decision.side).toBe('long');
    expect(decision.reason).toContain('flipped');
  });

  it('reduces when the same direction persists while a position is open', () => {
    const prediction: AlloraPrediction = {
      topic: 'BTC/USD - Price Prediction - 8h',
      horizonHours: 8,
      confidence: 0.9,
      direction: 'up',
      predictedPrice: 120,
      timestamp: '2026-02-05T12:00:00.000Z',
    };

    const decision = decideTradeAction({
      prediction,
      decisionThreshold: 0.62,
      cooldownRemaining: 0,
      maxLeverage: 2,
      baseContributionUsd: 100,
      previousAction: 'open',
      previousSide: 'long',
    });

    expect(decision.action).toBe('reduce');
    expect(decision.reason).toContain('reducing');
  });
});
