import { describe, expect, it, vi } from 'vitest';

import { scheduleCycleAfterInterruptResolution } from './interruptAutoCycle';

describe('scheduleCycleAfterInterruptResolution', () => {
  it('does nothing for unrelated interrupt types', () => {
    vi.useFakeTimers();
    const runCommand = vi.fn(() => true);

    scheduleCycleAfterInterruptResolution({
      interruptType: 'some-other-interrupt',
      runCommand,
      retryMs: 10,
      maxMs: 50,
    });

    vi.runAllTimers();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('retries until it can trigger a cycle run (or times out)', () => {
    vi.useFakeTimers();
    const runCommand = vi
      .fn<(command: string) => boolean>()
      .mockImplementationOnce(() => false)
      .mockImplementationOnce(() => false)
      .mockImplementationOnce(() => true);

    scheduleCycleAfterInterruptResolution({
      interruptType: 'pendle-fund-wallet-request',
      runCommand,
      retryMs: 100,
      maxMs: 1_000,
      now: () => Date.now(),
    });

    expect(runCommand).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand).toHaveBeenLastCalledWith('cycle');

    vi.advanceTimersByTime(100);
    expect(runCommand).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(100);
    expect(runCommand).toHaveBeenCalledTimes(3);
  });
});

