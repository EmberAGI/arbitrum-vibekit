import { describe, expect, it } from 'vitest';

import type { ClmmState } from './context.js';
import {
  buildTaskStatus,
  isTaskActive,
  isTaskTerminal,
  normalizeHexAddress,
  ClmmStateAnnotation,
} from './context.js';

describe('buildTaskStatus', () => {
  it('creates a task and status event with a message', () => {
    const result = buildTaskStatus(undefined, 'working', 'Processing pendle cycle');

    expect(result.task.id).toEqual(expect.any(String));
    expect(result.task.taskStatus.state).toBe('working');
    expect(result.task.taskStatus.message?.content).toBe('Processing pendle cycle');
    expect(result.task.taskStatus.timestamp).toEqual(expect.any(String));
    expect(result.statusEvent.type).toBe('status');
    expect(result.statusEvent.message).toBe('Processing pendle cycle');
    expect(result.statusEvent.task).toBe(result.task);
  });
});

describe('normalizeHexAddress', () => {
  it('returns a 0x-prefixed value', () => {
    const value = normalizeHexAddress('0xabc123', 'address');
    expect(value).toBe('0xabc123');
  });
});

describe('task state helpers', () => {
  it('identifies terminal states', () => {
    expect(isTaskTerminal('completed')).toBe(true);
    expect(isTaskTerminal('failed')).toBe(true);
    expect(isTaskTerminal('canceled')).toBe(true);
    expect(isTaskTerminal('not-a-task-state' as never)).toBe(false);
    expect(isTaskTerminal('rejected')).toBe(false);
    expect(isTaskTerminal('unknown')).toBe(false);
  });

  it('identifies active states', () => {
    expect(isTaskActive('submitted')).toBe(true);
    expect(isTaskActive('working')).toBe(true);
    expect(isTaskActive('input-required')).toBe(true);
    expect(isTaskActive('auth-required')).toBe(true);
  });
});

type ViewUpdate = Partial<ClmmState['view']>;

type ViewChannel = {
  fromCheckpoint: (checkpoint?: ClmmState['view']) => {
    update: (values: ViewUpdate[]) => boolean;
    get: () => ClmmState['view'];
  };
};

const buildTelemetry = (cycle: number) => ({
  cycle,
  action: 'hold',
  reason: 'steady',
  apy: 1 + cycle,
  ytSymbol: `YT-${cycle}`,
  timestamp: new Date(cycle).toISOString(),
});

describe('ClmmStateAnnotation view reducer', () => {
  it('replaces telemetry when the new list extends the existing prefix', () => {
    const channel = (ClmmStateAnnotation.spec.view as unknown as ViewChannel).fromCheckpoint();
    const first = buildTelemetry(1);
    const second = buildTelemetry(2);

    channel.update([
      { activity: { telemetry: [first], events: [] } },
      { activity: { telemetry: [first, second], events: [] } },
    ]);

    const view = channel.get();
    expect(view.activity.telemetry).toHaveLength(2);
    expect(view.activity.telemetry[0]?.cycle).toBe(1);
    expect(view.activity.telemetry[1]?.cycle).toBe(2);
  });

  it('appends telemetry when updates are not a prefix', () => {
    const channel = (ClmmStateAnnotation.spec.view as unknown as ViewChannel).fromCheckpoint();

    channel.update([
      { activity: { telemetry: [buildTelemetry(1)], events: [] } },
      { activity: { telemetry: [buildTelemetry(2)], events: [] } },
    ]);

    const view = channel.get();
    expect(view.activity.telemetry).toHaveLength(2);
    expect(view.activity.telemetry[0]?.cycle).toBe(1);
    expect(view.activity.telemetry[1]?.cycle).toBe(2);
  });
});
