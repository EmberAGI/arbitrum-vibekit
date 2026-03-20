export type PiSchedulerLeaseRecord = {
  automationId: string;
  ownerId: string;
  leaseExpiresAt: Date;
  lastHeartbeatAt: Date;
};

export type PiAutomationScheduleRecord = {
  automationId: string;
  nextRunAt: Date | null;
  suspended: boolean;
};

export function acquireSchedulerLease(params: {
  automationId: string;
  ownerId: string;
  now: Date;
  ttlMs: number;
  existingLease?: PiSchedulerLeaseRecord;
}): PiSchedulerLeaseRecord | null {
  const { automationId, ownerId, now, ttlMs, existingLease } = params;
  if (existingLease && existingLease.leaseExpiresAt > now) {
    return null;
  }

  return {
    automationId,
    ownerId,
    leaseExpiresAt: new Date(now.getTime() + ttlMs),
    lastHeartbeatAt: now,
  };
}

export function recoverDueAutomations(params: {
  now: Date;
  automations: readonly PiAutomationScheduleRecord[];
  leases: readonly PiSchedulerLeaseRecord[];
}): string[] {
  const { now, automations, leases } = params;
  const leaseByAutomationId = new Map(leases.map((lease) => [lease.automationId, lease]));

  return automations
    .filter((automation) => {
      if (automation.suspended || !automation.nextRunAt || automation.nextRunAt > now) {
        return false;
      }

      const lease = leaseByAutomationId.get(automation.automationId);
      return !lease || lease.leaseExpiresAt <= now;
    })
    .map((automation) => automation.automationId);
}
