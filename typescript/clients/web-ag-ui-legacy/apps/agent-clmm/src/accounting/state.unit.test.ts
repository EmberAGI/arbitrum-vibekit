import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AccountingState, FlowLogEvent, NavSnapshot } from './types.js';

vi.mock('node:crypto', () => ({
  randomUUID: () => 'uuid-1',
}));

afterEach(() => {
  vi.useRealTimers();
});

function buildSnapshot(overrides: Partial<NavSnapshot> = {}): NavSnapshot {
  return {
    contextId: 'ctx-1',
    trigger: 'cycle',
    timestamp: '2025-01-01T00:00:00.000Z',
    protocolId: 'camelot-clmm',
    walletAddress: '0xabc',
    chainId: 42161,
    totalUsd: 0,
    positions: [],
    priceSource: 'unknown',
    ...overrides,
  };
}

function buildState(overrides: Partial<AccountingState> = {}): AccountingState {
  return {
    navSnapshots: [],
    flowLog: [],
    ...overrides,
  };
}

describe('accounting state', () => {
  it('creates flow events with defaults and requires contextId', async () => {
    const { createFlowEvent } = await import('./state.js');

    // Given a fixed system time and a hire event payload
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    // When creating the flow event
    const event = createFlowEvent({
      type: 'hire',
      contextId: 'ctx-1',
      chainId: 42161,
      usdValue: 100,
    });

    // Then it should fill required defaults
    expect(event).toEqual({
      type: 'hire',
      contextId: 'ctx-1',
      chainId: 42161,
      usdValue: 100,
      id: 'uuid-1',
      timestamp: '2025-01-01T00:00:00.000Z',
    });

    // And it should reject missing contextId
    expect(() =>
      createFlowEvent({
        type: 'hire',
        chainId: 42161,
      }),
    ).toThrow('Flow log event missing contextId');
  });

  it('appends snapshots and updates the latest metadata', async () => {
    const { appendNavSnapshots } = await import('./state.js');

    // Given an existing accounting state
    const existing = buildState({
      navSnapshots: [buildSnapshot({ timestamp: '2025-01-01T00:00:00.000Z', totalUsd: 50 })],
      latestNavSnapshot: buildSnapshot({ timestamp: '2025-01-01T00:00:00.000Z', totalUsd: 50 }),
    });

    // When new snapshots are appended
    const next = appendNavSnapshots(existing, [
      buildSnapshot({ timestamp: '2025-01-02T00:00:00.000Z', totalUsd: 75 }),
    ]);

    // Then the snapshot history and latest pointer are updated
    expect(next.navSnapshots).toHaveLength(2);
    expect(next.latestNavSnapshot?.totalUsd).toBe(75);
    expect(next.lastUpdated).toBe('2025-01-02T00:00:00.000Z');
  });

  it('recomputes lifecycle metrics from flow logs and NAV', async () => {
    const { recomputeAccountingMetrics } = await import('./state.js');

    // Given a hire event and a NAV snapshot
    const flowLog: FlowLogEvent[] = [
      {
        id: 'hire-1',
        type: 'hire',
        timestamp: '2025-01-01T00:00:00.000Z',
        contextId: 'ctx-1',
        chainId: 42161,
        usdValue: 100,
      },
    ];
    const existing = buildState({
      flowLog,
      latestNavSnapshot: buildSnapshot({ totalUsd: 110, timestamp: '2025-01-31T00:00:00.000Z' }),
      highWaterMarkUsd: 80,
    });

    // When metrics are recomputed at the end of January
    const next = recomputeAccountingMetrics({
      existing,
      now: '2025-01-31T00:00:00.000Z',
    });

    // Then accounting outputs are updated for the current lifecycle
    expect(next.initialAllocationUsd).toBe(100);
    expect(next.positionsUsd).toBe(110);
    expect(next.cashUsd).toBe(0);
    expect(next.aumUsd).toBe(110);
    expect(next.lifetimePnlUsd).toBe(10);
    expect(next.lifetimeReturnPct).toBe(0.1);
    expect(next.highWaterMarkUsd).toBe(110);
    expect(next.apy).toBeCloseTo(Math.pow(1.1, 365 / 30) - 1, 6);
  });

  it('resets the high-water mark when a new hire lifecycle begins', async () => {
    const { recomputeAccountingMetrics } = await import('./state.js');

    // Given an existing lifecycle with a prior high-water mark
    const existing = buildState({
      flowLog: [
        {
          id: 'hire-1',
          type: 'hire',
          timestamp: '2025-01-01T00:00:00.000Z',
          contextId: 'ctx-1',
          chainId: 42161,
          usdValue: 100,
        },
        {
          id: 'hire-2',
          type: 'hire',
          timestamp: '2025-02-01T00:00:00.000Z',
          contextId: 'ctx-1',
          chainId: 42161,
          usdValue: 50,
        },
      ],
      latestNavSnapshot: buildSnapshot({ totalUsd: 40, timestamp: '2025-02-01T00:00:00.000Z' }),
      highWaterMarkUsd: 200,
      lifecycleStart: '2025-01-01T00:00:00.000Z',
    });

    // When metrics are recomputed for the new lifecycle
    const next = recomputeAccountingMetrics({ existing });

    // Then the high-water mark resets to the new AUM
    expect(next.lifecycleStart).toBe('2025-02-01T00:00:00.000Z');
    expect(next.initialAllocationUsd).toBe(50);
    expect(next.cashUsd).toBe(10);
    expect(next.highWaterMarkUsd).toBe(50);
  });

  it('applies snapshot and flow updates in one pass', async () => {
    const { applyAccountingUpdate } = await import('./state.js');

    // Given a new hire flow event and snapshot update
    const flowEvents: FlowLogEvent[] = [
      {
        id: 'hire-1',
        type: 'hire',
        timestamp: '2025-01-01T00:00:00.000Z',
        contextId: 'ctx-1',
        chainId: 42161,
        usdValue: 100,
      },
    ];
    const snapshot = buildSnapshot({ totalUsd: 25, timestamp: '2025-01-02T00:00:00.000Z' });

    // When the update is applied
    const next = applyAccountingUpdate({
      existing: undefined,
      flowEvents,
      snapshots: [snapshot],
      now: '2025-01-02T00:00:00.000Z',
    });

    // Then the new state reflects the update
    expect(next.latestNavSnapshot?.totalUsd).toBe(25);
    expect(next.flowLog).toHaveLength(1);
    expect(next.aumUsd).toBe(100);
  });
});
