import { describe, expect, it, vi } from 'vitest';

import { resumeInterruptViaAgent } from './interruptResolution';

describe('resumeInterruptViaAgent', () => {
  it('returns false when agent cannot run resume command', async () => {
    await expect(
      resumeInterruptViaAgent({
        agent: null,
        resumePayload: '{"outcome":"signed"}',
      }),
    ).resolves.toBe(false);
  });

  it('calls the injected resume runner with resume command payload', async () => {
    const runResume = vi.fn().mockResolvedValue(undefined);
    const agent = {};
    const resumePayload = {
      outcome: 'signed',
      signedDelegations: [
        {
          signature: '0x1234',
        },
      ],
    };

    await expect(
      resumeInterruptViaAgent({
        agent,
        resumePayload,
        runResume,
      }),
    ).resolves.toBe(true);

    expect(runResume).toHaveBeenCalledWith({
      agent,
      payload: {
        forwardedProps: {
          command: {
            resume: resumePayload,
          },
        },
      },
    });
  });

  it('retries transient busy resume failures before succeeding', async () => {
    vi.useFakeTimers();

    const runResume = vi
      .fn()
      .mockRejectedValueOnce(new Error('Thread already running'))
      .mockResolvedValueOnce(undefined);
    const agent = {};

    try {
      const promise = resumeInterruptViaAgent({
        agent,
        resumePayload: '{"outcome":"signed"}',
        runResume,
        retryDelayMs: 10,
      });

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10);

      await expect(promise).resolves.toBe(true);
      expect(runResume).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
