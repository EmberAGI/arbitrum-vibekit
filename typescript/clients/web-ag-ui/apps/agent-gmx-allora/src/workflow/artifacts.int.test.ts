import { describe, expect, it } from 'vitest';

import type { GmxAlloraTelemetry } from '../domain/types.js';

import { buildSummaryArtifact } from './artifacts.js';

describe('buildSummaryArtifact (integration)', () => {
  it('summarizes telemetry timeline and signal stats', () => {
    const telemetry: GmxAlloraTelemetry[] = [
      {
        cycle: 1,
        action: 'long',
        reason: 'Signal bullish',
        marketSymbol: 'BTC/USDC',
        timestamp: '2026-02-05T10:00:00.000Z',
        prediction: { topicId: 14, combinedValue: 48000, confidence: 0.4 },
      },
      {
        cycle: 2,
        action: 'hold',
        reason: 'Exposure limit',
        marketSymbol: 'BTC/USDC',
        timestamp: '2026-02-05T12:00:00.000Z',
        prediction: { topicId: 14, combinedValue: 47000, confidence: 0.2 },
      },
      {
        cycle: 3,
        action: 'short',
        reason: 'Signal bearish',
        marketSymbol: 'ETH/USDC',
        timestamp: '2026-02-05T14:00:00.000Z',
        prediction: { topicId: 9, combinedValue: 2600, confidence: 0.8 },
        txHash: '0xabc',
      },
    ];

    const artifact = buildSummaryArtifact(telemetry);
    const data = artifact.parts[0]?.data as {
      cycles: number;
      actionCounts: Record<string, number>;
      timeWindow: { firstTimestamp?: string; lastTimestamp?: string };
      signalSummary: { bestConfidence: number; lastConfidence: number; lastMarket: string };
      latestCycle?: GmxAlloraTelemetry;
      actionsTimeline: Array<{ cycle: number; action: string; reason: string; txHash?: string }>;
    };

    expect(artifact.artifactId).toBe('gmx-allora-summary');
    expect(data.cycles).toBe(3);
    expect(data.actionCounts).toEqual({ long: 1, hold: 1, short: 1 });
    expect(data.timeWindow.firstTimestamp).toBe('2026-02-05T10:00:00.000Z');
    expect(data.timeWindow.lastTimestamp).toBe('2026-02-05T14:00:00.000Z');
    expect(data.signalSummary.bestConfidence).toBe(0.8);
    expect(data.signalSummary.lastConfidence).toBe(0.8);
    expect(data.signalSummary.lastMarket).toBe('ETH/USDC');
    expect(data.latestCycle?.cycle).toBe(3);
    expect(data.actionsTimeline[2]).toEqual({
      cycle: 3,
      action: 'short',
      reason: 'Signal bearish',
      txHash: '0xabc',
    });
  });
});
