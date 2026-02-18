type DisconnectHandler = () => Promise<void> | void;

const ownerDisconnectHandlers = new Map<string, DisconnectHandler>();
let activeOwnerId: string | null = null;

export function registerAgentStreamOwner(ownerId: string, onDisconnect: DisconnectHandler): void {
  ownerDisconnectHandlers.set(ownerId, onDisconnect);
}

export function unregisterAgentStreamOwner(ownerId: string): void {
  ownerDisconnectHandlers.delete(ownerId);
  if (activeOwnerId === ownerId) {
    activeOwnerId = null;
  }
}

export function releaseAgentStreamOwner(ownerId: string): void {
  if (activeOwnerId === ownerId) {
    activeOwnerId = null;
  }
}

export async function acquireAgentStreamOwner(ownerId: string): Promise<void> {
  if (activeOwnerId === ownerId) {
    return;
  }

  const previousOwnerId = activeOwnerId;
  activeOwnerId = ownerId;

  if (!previousOwnerId) {
    return;
  }

  const disconnect = ownerDisconnectHandlers.get(previousOwnerId);
  if (!disconnect) {
    return;
  }

  await Promise.resolve(disconnect()).catch(() => {
    // best-effort preemption; ignore failures.
  });
}

export function getActiveAgentStreamOwner(): string | null {
  return activeOwnerId;
}

export function __resetAgentStreamCoordinatorForTests(): void {
  ownerDisconnectHandlers.clear();
  activeOwnerId = null;
}
