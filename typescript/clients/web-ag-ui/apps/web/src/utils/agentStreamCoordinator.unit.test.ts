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

  it('releases the active owner without triggering disconnect', async () => {
    __resetAgentStreamCoordinatorForTests();

    const ownerA = 'owner-a';
    const disconnectA = vi.fn().mockResolvedValue(undefined);
    registerAgentStreamOwner(ownerA, disconnectA);

    await acquireAgentStreamOwner(ownerA);
    expect(getActiveAgentStreamOwner()).toBe(ownerA);

    releaseAgentStreamOwner(ownerA);
    expect(getActiveAgentStreamOwner()).toBeNull();
    expect(disconnectA).not.toHaveBeenCalled();

    unregisterAgentStreamOwner(ownerA);
    __resetAgentStreamCoordinatorForTests();
  });
});
