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

  it('calls agent.runAgent with resume command payload', async () => {
    const runAgent = vi.fn().mockResolvedValue(undefined);

    await expect(
      resumeInterruptViaAgent({
        agent: { runAgent },
        resumePayload: '{"outcome":"signed"}',
      }),
    ).resolves.toBe(true);

    expect(runAgent).toHaveBeenCalledWith({
      forwardedProps: {
        command: {
          resume: '{"outcome":"signed"}',
        },
      },
    });
  });
});
