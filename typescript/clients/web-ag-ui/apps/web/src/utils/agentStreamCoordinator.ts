type DisconnectHandler = () => Promise<void> | void;

const ownerDisconnectHandlers = new Map<string, DisconnectHandler>();
let activeOwnerId: string | null = null;
let transitionQueue: Promise<void> = Promise.resolve();

const runDisconnect = async (ownerId: string): Promise<void> => {
  const disconnect = ownerDisconnectHandlers.get(ownerId);
  if (!disconnect) {
    return;
  }
  await Promise.resolve(disconnect()).catch(() => {
    // best-effort preemption/cleanup; ignore failures.
  });
};

const enqueueTransition = async (operation: () => Promise<void> | void): Promise<void> => {
  const next = transitionQueue.then(() => operation());
  transitionQueue = next.then(
    () => undefined,
    () => undefined,
  );
  await next;
};

export function registerAgentStreamOwner(ownerId: string, onDisconnect: DisconnectHandler): void {
  ownerDisconnectHandlers.set(ownerId, onDisconnect);
}

export async function unregisterAgentStreamOwner(ownerId: string): Promise<void> {
  await enqueueTransition(async () => {
    if (activeOwnerId === ownerId) {
      await runDisconnect(ownerId);
      if (activeOwnerId === ownerId) {
        activeOwnerId = null;
      }
    }
    ownerDisconnectHandlers.delete(ownerId);
  });
}

export async function releaseAgentStreamOwner(ownerId: string): Promise<void> {
  await enqueueTransition(async () => {
    if (activeOwnerId !== ownerId) {
      return;
    }
    await runDisconnect(ownerId);
    if (activeOwnerId === ownerId) {
      activeOwnerId = null;
    }
  });
}

export async function acquireAgentStreamOwner(ownerId: string): Promise<void> {
  await enqueueTransition(async () => {
    if (activeOwnerId === ownerId) {
      return;
    }

    const previousOwnerId = activeOwnerId;
    if (previousOwnerId) {
      await runDisconnect(previousOwnerId);
      if (activeOwnerId !== previousOwnerId) {
        return;
      }
    }

    activeOwnerId = ownerId;
  });
}

export function getActiveAgentStreamOwner(): string | null {
  return activeOwnerId;
}

export function __resetAgentStreamCoordinatorForTests(): void {
  ownerDisconnectHandlers.clear();
  activeOwnerId = null;
  transitionQueue = Promise.resolve();
}
