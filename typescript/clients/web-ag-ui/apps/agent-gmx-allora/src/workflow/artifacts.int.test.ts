import { describe, expect, it } from 'vitest';

import type { GmxAlloraTelemetry } from '../domain/types.js';

import { buildSummaryArtifact } from './artifacts.js';

describe('buildSummaryArtifact (integration)', () => {
  it('summarizes telemetry timeline and signal stats', () => {
    const telemetry: GmxAlloraTelemetry[] = [
      {
        cycle: 1,
        action: 'open',
        reason: 'Signal bullish',
        marketSymbol: 'BTC/USDC',
        side: 'long',
        leverage: 2,
        sizeUsd: 250,
        timestamp: '2026-02-05T10:00:00.000Z',
        prediction: {
          topic: 'BTC/USD - Price Prediction - 8h',
          horizonHours: 8,
          confidence: 0.4,
          direction: 'up',
          predictedPrice: 48000,
          timestamp: '2026-02-05T10:00:00.000Z',
        },
      },
      {
        cycle: 2,
        action: 'hold',
        reason: 'Exposure limit',
        marketSymbol: 'BTC/USDC',
        timestamp: '2026-02-05T12:00:00.000Z',
        prediction: {
          topic: 'BTC/USD - Price Prediction - 8h',
          horizonHours: 8,
          confidence: 0.2,
          direction: 'down',
          predictedPrice: 47000,
          timestamp: '2026-02-05T12:00:00.000Z',
        },
      },
      {
        cycle: 3,
        action: 'open',
        reason: 'Signal bearish',
        marketSymbol: 'ETH/USDC',
        timestamp: '2026-02-05T14:00:00.000Z',
        side: 'short',
        leverage: 2,
        sizeUsd: 250,
        prediction: {
          topic: 'ETH/USD - Price Prediction - 8h',
          horizonHours: 8,
          confidence: 0.8,
          direction: 'down',
          predictedPrice: 2600,
          timestamp: '2026-02-05T14:00:00.000Z',
        },
        txHash: '0xabc',
      },
    ];

    const artifact = buildSummaryArtifact(telemetry);
    expect(artifact.artifactId).toBe('gmx-allora-summary');
    expect(artifact.description.toLowerCase()).toContain('bearish');

    const data = artifact.parts[1]?.data as {
      cycles: number;
      actionCounts: Record<string, number>;
      timeWindow: { firstTimestamp?: string; lastTimestamp?: string };
      signalSummary: { bestConfidence: number; lastConfidence: number; lastMarket: string };
      latestCycle?: GmxAlloraTelemetry;
      actionsTimeline: Array<{ cycle: number; action: string; reason: string; txHash?: string }>;
    };

    expect(data.cycles).toBe(3);
    expect(data.actionCounts).toEqual({ open: 2, hold: 1 });
    expect(data.timeWindow.firstTimestamp).toBe('2026-02-05T10:00:00.000Z');
    expect(data.timeWindow.lastTimestamp).toBe('2026-02-05T14:00:00.000Z');
    expect(data.signalSummary.bestConfidence).toBe(0.8);
    expect(data.signalSummary.lastConfidence).toBe(0.8);
    expect(data.signalSummary.lastMarket).toBe('ETH/USDC');
    expect(data.latestCycle?.cycle).toBe(3);
    expect(data.actionsTimeline[2]).toEqual({
      cycle: 3,
      action: 'open',
      reason: 'Signal bearish',
      txHash: '0xabc',
    });
  });
});
