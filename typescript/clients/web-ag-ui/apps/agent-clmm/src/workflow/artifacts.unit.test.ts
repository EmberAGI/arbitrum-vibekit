import { describe, expect, it } from 'vitest';

import type { RebalanceTelemetry } from '../domain/types.js';

import { buildSummaryArtifact } from './artifacts.js';

function createTelemetryEntry(
  cycle: number,
  action: RebalanceTelemetry['action'],
): RebalanceTelemetry {
  return {
    cycle,
    poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
    midPrice: 1,
    action,
    reason: `${action} cycle ${cycle}`,
    timestamp: `2026-03-10T16:${String(cycle).padStart(2, '0')}:00.000Z`,
  };
}

describe('buildSummaryArtifact', () => {
  it('keeps the last 10 cycles plus the last 5 non-hold actions in the actions timeline', () => {
    const telemetry: RebalanceTelemetry[] = [];
    for (let cycle = 1; cycle <= 20; cycle += 1) {
      const action =
        cycle === 2
          ? 'enter-range'
          : cycle === 4
            ? 'adjust-range'
            : cycle === 6
              ? 'compound-fees'
              : cycle === 8
                ? 'exit-range'
                : cycle === 10
                  ? 'adjust-range'
                  : 'hold';
      telemetry.push(createTelemetryEntry(cycle, action));
    }

    const artifact = buildSummaryArtifact(telemetry);
    const payload = artifact.parts[0];

    expect(payload?.kind).toBe('data');
    expect(payload && 'data' in payload ? payload.data : undefined).toMatchObject({
      cycles: 20,
      actionsTimeline: [
        { cycle: 2, action: 'enter-range' },
        { cycle: 4, action: 'adjust-range' },
        { cycle: 6, action: 'compound-fees' },
        { cycle: 8, action: 'exit-range' },
        { cycle: 10, action: 'adjust-range' },
        { cycle: 11, action: 'hold' },
        { cycle: 12, action: 'hold' },
        { cycle: 13, action: 'hold' },
        { cycle: 14, action: 'hold' },
        { cycle: 15, action: 'hold' },
        { cycle: 16, action: 'hold' },
        { cycle: 17, action: 'hold' },
        { cycle: 18, action: 'hold' },
        { cycle: 19, action: 'hold' },
        { cycle: 20, action: 'hold' },
      ],
    });
  });
});
