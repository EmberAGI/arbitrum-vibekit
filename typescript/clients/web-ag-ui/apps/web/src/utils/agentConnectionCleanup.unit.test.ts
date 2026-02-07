import { describe, expect, it, vi } from 'vitest';

import { cleanupAgentConnection } from './agentConnectionCleanup';

describe('cleanupAgentConnection', () => {
  it('detaches active runs without poisoning future connections (does not call abortRun)', async () => {
    const abortRun = vi.fn();
    const detachActiveRun = vi.fn().mockResolvedValue(undefined);

    await cleanupAgentConnection({
      abortRun,
      detachActiveRun,
    });

    expect(detachActiveRun).toHaveBeenCalledTimes(1);
    expect(abortRun).not.toHaveBeenCalled();
  });
});

