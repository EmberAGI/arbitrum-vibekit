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

  it('does not wait for a slow detach before allowing the next route runtime to mount', async () => {
    const detachActiveRun = vi.fn(
      () =>
        new Promise<void>(() => {
          // Simulate an AG-UI connect stream that can remain open for many seconds.
        }),
    );

    await expect(cleanupAgentConnection({ detachActiveRun })).resolves.toBeUndefined();

    expect(detachActiveRun).toHaveBeenCalledTimes(1);
  });
});
