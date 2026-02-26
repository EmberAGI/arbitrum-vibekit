import { describe, expect, it, vi } from 'vitest';

import {
  __resetAgentStreamCoordinatorForTests,
  acquireAgentStreamOwner,
  getActiveAgentStreamOwner,
  releaseAgentStreamOwner,
  registerAgentStreamOwner,
  unregisterAgentStreamOwner,
} from './agentStreamCoordinator';

describe('agentStreamCoordinator', () => {
  it('preempts the previous owner and keeps only one active stream owner', async () => {
    __resetAgentStreamCoordinatorForTests();

    const ownerA = 'owner-a';
    const ownerB = 'owner-b';
    const disconnectA = vi.fn().mockResolvedValue(undefined);

    registerAgentStreamOwner(ownerA, disconnectA);
    registerAgentStreamOwner(ownerB, vi.fn().mockResolvedValue(undefined));

    await acquireAgentStreamOwner(ownerA);
    expect(getActiveAgentStreamOwner()).toBe(ownerA);
    expect(disconnectA).not.toHaveBeenCalled();

    await acquireAgentStreamOwner(ownerB);
    expect(disconnectA).toHaveBeenCalledTimes(1);
    expect(getActiveAgentStreamOwner()).toBe(ownerB);

    unregisterAgentStreamOwner(ownerA);
    unregisterAgentStreamOwner(ownerB);
    __resetAgentStreamCoordinatorForTests();
  });

  it('releases the active owner after disconnect cleanup', async () => {
    __resetAgentStreamCoordinatorForTests();

    const ownerA = 'owner-a';
    const disconnectA = vi.fn().mockResolvedValue(undefined);
    registerAgentStreamOwner(ownerA, disconnectA);

    await acquireAgentStreamOwner(ownerA);
    expect(getActiveAgentStreamOwner()).toBe(ownerA);

    await releaseAgentStreamOwner(ownerA);
    expect(getActiveAgentStreamOwner()).toBeNull();
    expect(disconnectA).toHaveBeenCalledTimes(1);

    await unregisterAgentStreamOwner(ownerA);
    __resetAgentStreamCoordinatorForTests();
  });

  it('does not hand off ownership until active-owner disconnect settles', async () => {
    __resetAgentStreamCoordinatorForTests();

    const ownerA = 'owner-a';
    const ownerB = 'owner-b';
    let resolveDisconnectA: (() => void) | null = null;
    const disconnectA = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDisconnectA = resolve;
        }),
    );
    const disconnectB = vi.fn().mockResolvedValue(undefined);

    registerAgentStreamOwner(ownerA, disconnectA);
    registerAgentStreamOwner(ownerB, disconnectB);

    await acquireAgentStreamOwner(ownerA);
    expect(getActiveAgentStreamOwner()).toBe(ownerA);

    void releaseAgentStreamOwner(ownerA);
    const acquireOwnerBPromise = acquireAgentStreamOwner(ownerB);

    await Promise.resolve();
    expect(disconnectA).toHaveBeenCalledTimes(1);
    expect(getActiveAgentStreamOwner()).toBe(ownerA);

    resolveDisconnectA?.();
    await acquireOwnerBPromise;
    expect(getActiveAgentStreamOwner()).toBe(ownerB);

    await releaseAgentStreamOwner(ownerB);
    await unregisterAgentStreamOwner(ownerA);
    await unregisterAgentStreamOwner(ownerB);
    __resetAgentStreamCoordinatorForTests();
  });
});
