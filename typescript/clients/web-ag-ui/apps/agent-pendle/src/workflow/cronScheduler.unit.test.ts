import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cancelCronForThread,
  configureCronExecutor,
  ensureCronForThread,
} from './cronScheduler.js';

const { scheduleMock, stopMock } = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  stopMock: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: scheduleMock,
  },
}));

describe('cronScheduler', () => {
  afterEach(() => {
    scheduleMock.mockReset();
    stopMock.mockReset();
    cancelCronForThread('thread-a');
    cancelCronForThread('thread-b');
  });

  it('schedules a cron job and executes the configured callback', () => {
    let capturedCron = '';
    let capturedTick: (() => void) | undefined;
    scheduleMock.mockImplementation((cronExpression: string, tick: () => void) => {
      capturedCron = cronExpression;
      capturedTick = tick;
      return { stop: stopMock };
    });

    const executor = vi.fn();
    configureCronExecutor(executor);

    const job = ensureCronForThread('thread-a', 3_000);

    expect(job).toBeDefined();
    expect(capturedCron).toBe('*/3 * * * * *');

    capturedTick?.();
    expect(executor).toHaveBeenCalledWith('thread-a');
  });

  it('does not schedule duplicate cron jobs for the same thread', () => {
    scheduleMock.mockReturnValue({ stop: stopMock });
    configureCronExecutor(vi.fn());

    const first = ensureCronForThread('thread-b', 5_000);
    const second = ensureCronForThread('thread-b', 5_000);

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(scheduleMock).toHaveBeenCalledTimes(1);
  });
});
