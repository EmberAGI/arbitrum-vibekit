import { describe, expect, it } from 'vitest';

import type { AlloraInference } from '../clients/allora.js';

import { buildAlloraPrediction } from './alloraPrediction.js';

describe('buildAlloraPrediction', () => {
  it('derives direction and confidence from inference vs current price', () => {
    const inference: AlloraInference = {
      topicId: 14,
      combinedValue: 110,
      confidenceIntervalValues: [100, 105, 110, 115, 120],
    };

    const prediction = buildAlloraPrediction({
      inference,
      currentPrice: 100,
      topic: 'BTC/USD - Price Prediction - 8h',
      horizonHours: 8,
      now: new Date('2026-02-05T12:00:00.000Z'),
    });

    expect(prediction).toEqual({
      topic: 'BTC/USD - Price Prediction - 8h',
      horizonHours: 8,
      confidence: 0.91,
      direction: 'up',
      predictedPrice: 110,
      timestamp: '2026-02-05T12:00:00.000Z',
    });
  });
});
