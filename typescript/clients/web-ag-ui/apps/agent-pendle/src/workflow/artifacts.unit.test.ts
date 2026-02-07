import { describe, expect, it } from 'vitest';

import type { PendleTelemetry } from '../domain/types.js';

import { buildSummaryArtifact, buildTelemetryArtifact } from './artifacts.js';

describe('buildTelemetryArtifact', () => {
  it('wraps telemetry data into a Pendle artifact payload', () => {
    const entry: PendleTelemetry = {
      cycle: 3,
      action: 'rebalance',
      reason: 'Rotated into higher APY.',
      apy: 5.5,
      ytSymbol: 'YT-USDai',
      txHash: '0xabc',
      timestamp: '2026-02-04T12:00:00.000Z',
      metrics: {
        bestApy: 5.5,
        currentApy: 5.5,
        apyDelta: 0.6,
        rebalanceThresholdPct: 0.5,
      },
    };

    const artifact = buildTelemetryArtifact(entry);

    expect(artifact.artifactId).toBe('pendle-telemetry');
    expect(artifact.name).toBe('pendle-telemetry.json');
    expect(artifact.parts[0]?.kind).toBe('data');
    expect(artifact.parts[0]?.data).toEqual(entry);
  });
});

describe('buildSummaryArtifact', () => {
  it('summarizes telemetry into counts, window, and yield stats', () => {
    const telemetry: PendleTelemetry[] = [
      {
        cycle: 1,
        action: 'scan-yields',
        reason: 'Scanning.',
        apy: 4.2,
        ytSymbol: 'YT-A',
        timestamp: '2026-02-04T08:00:00.000Z',
      },
      {
        cycle: 2,
        action: 'hold',
        reason: 'Holding.',
        apy: 4.2,
        ytSymbol: 'YT-A',
        timestamp: '2026-02-04T10:00:00.000Z',
      },
      {
        cycle: 3,
        action: 'rebalance',
        reason: 'Rotate.',
        apy: 5.1,
        ytSymbol: 'YT-B',
        txHash: '0xabc',
        timestamp: '2026-02-04T09:00:00.000Z',
      },
    ];

    const artifact = buildSummaryArtifact(telemetry);
    const summary = artifact.parts[0]?.data as Record<string, unknown>;

    expect(artifact.artifactId).toBe('pendle-summary');
    expect(artifact.name).toBe('pendle-summary.json');
    expect(summary['cycles']).toBe(3);
    expect(summary['actionCounts']).toEqual({
      'scan-yields': 1,
      hold: 1,
      rebalance: 1,
    });
    expect(summary['timeWindow']).toEqual({
      firstTimestamp: '2026-02-04T08:00:00.000Z',
      lastTimestamp: '2026-02-04T10:00:00.000Z',
    });
    expect(summary['yieldSummary']).toEqual({
      bestApy: 5.1,
      lastApy: 5.1,
      lastYt: 'YT-B',
    });
    expect(summary['latestCycle']).toEqual(telemetry[2]);
  });
});
