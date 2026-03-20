import { describe, expect, it } from 'vitest';

import { acquireSchedulerLease, recoverDueAutomations } from './index.js';

describe('schedulerLease', () => {
  it('acquires a lease when none exists or the prior lease has expired', () => {
    const now = new Date('2026-03-18T20:00:00.000Z');

    expect(
      acquireSchedulerLease({
        automationId: 'auto-1',
        ownerId: 'worker-a',
        now,
        ttlMs: 30_000,
      }),
    ).toEqual({
      automationId: 'auto-1',
      ownerId: 'worker-a',
      leaseExpiresAt: new Date('2026-03-18T20:00:30.000Z'),
      lastHeartbeatAt: now,
    });

    expect(
      acquireSchedulerLease({
        automationId: 'auto-1',
        ownerId: 'worker-a',
        now,
        ttlMs: 30_000,
        existingLease: {
          automationId: 'auto-1',
          ownerId: 'worker-b',
          leaseExpiresAt: new Date('2026-03-18T19:59:59.000Z'),
          lastHeartbeatAt: new Date('2026-03-18T19:59:29.000Z'),
        },
      }),
    ).toEqual({
      automationId: 'auto-1',
      ownerId: 'worker-a',
      leaseExpiresAt: new Date('2026-03-18T20:00:30.000Z'),
      lastHeartbeatAt: now,
    });
  });

  it('refuses to hand out an active lease and recovers only due runnable automations after restart', () => {
    const now = new Date('2026-03-18T20:00:00.000Z');

    expect(
      acquireSchedulerLease({
        automationId: 'auto-1',
        ownerId: 'worker-a',
        now,
        ttlMs: 30_000,
        existingLease: {
          automationId: 'auto-1',
          ownerId: 'worker-b',
          leaseExpiresAt: new Date('2026-03-18T20:00:10.000Z'),
          lastHeartbeatAt: new Date('2026-03-18T19:59:50.000Z'),
        },
      }),
    ).toBeNull();

    expect(
      recoverDueAutomations({
        now,
        automations: [
          { automationId: 'due-no-lease', nextRunAt: new Date('2026-03-18T19:59:00.000Z'), suspended: false },
          { automationId: 'due-expired-lease', nextRunAt: new Date('2026-03-18T19:59:00.000Z'), suspended: false },
          { automationId: 'future', nextRunAt: new Date('2026-03-18T20:05:00.000Z'), suspended: false },
          { automationId: 'suspended', nextRunAt: new Date('2026-03-18T19:59:00.000Z'), suspended: true },
        ],
        leases: [
          {
            automationId: 'due-expired-lease',
            ownerId: 'worker-a',
            leaseExpiresAt: new Date('2026-03-18T19:59:50.000Z'),
            lastHeartbeatAt: new Date('2026-03-18T19:59:20.000Z'),
          },
          {
            automationId: 'future',
            ownerId: 'worker-b',
            leaseExpiresAt: new Date('2026-03-18T20:00:10.000Z'),
            lastHeartbeatAt: new Date('2026-03-18T19:59:40.000Z'),
          },
        ],
      }),
    ).toEqual(['due-no-lease', 'due-expired-lease']);
  });
});
