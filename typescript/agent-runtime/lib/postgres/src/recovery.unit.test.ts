import { describe, expect, it } from 'vitest';

import { buildRestartRecoveryPlan } from './index.js';

describe('recovery', () => {
  it('builds a restart recovery plan from durable automations, outbox intents, and the current interrupt on interrupted executions', () => {
    const now = new Date('2026-03-18T20:00:00.000Z');

    expect(
      buildRestartRecoveryPlan({
        now,
        automations: [
          { automationId: 'auto-due', nextRunAt: new Date('2026-03-18T19:59:00.000Z'), suspended: false },
          { automationId: 'auto-suspended', nextRunAt: new Date('2026-03-18T19:59:00.000Z'), suspended: true },
        ],
        leases: [],
        executions: [
          {
            executionId: 'exec-queued',
            threadId: 'thread-1',
            status: 'queued',
            currentInterruptId: null,
          },
          {
            executionId: 'exec-working',
            threadId: 'thread-2',
            status: 'working',
            currentInterruptId: null,
          },
          {
            executionId: 'exec-interrupted',
            threadId: 'thread-3',
            status: 'interrupted',
            currentInterruptId: 'interrupt-current',
          },
          {
            executionId: 'exec-complete',
            threadId: 'thread-4',
            status: 'completed',
            currentInterruptId: null,
          },
        ],
        outboxIntents: [
          {
            outboxId: 'outbox-due',
            status: 'pending',
            availableAt: new Date('2026-03-18T19:59:00.000Z'),
            deliveredAt: null,
          },
          {
            outboxId: 'outbox-delivered',
            status: 'delivered',
            availableAt: new Date('2026-03-18T19:59:00.000Z'),
            deliveredAt: new Date('2026-03-18T19:59:30.000Z'),
          },
        ],
        interrupts: [
          {
            interruptId: 'interrupt-current',
            executionId: 'exec-interrupted',
            threadId: 'thread-3',
            status: 'pending',
            mirroredToActivity: true,
          },
          {
            interruptId: 'interrupt-stale',
            executionId: 'exec-interrupted',
            threadId: 'thread-3',
            status: 'pending',
            mirroredToActivity: true,
          },
          {
            interruptId: 'interrupt-hidden',
            executionId: 'exec-working',
            threadId: 'thread-2',
            status: 'pending',
            mirroredToActivity: false,
          },
          {
            interruptId: 'interrupt-resolved',
            executionId: 'exec-interrupted',
            threadId: 'thread-3',
            status: 'resolved',
            mirroredToActivity: true,
          },
        ],
      }),
    ).toEqual({
      automationIdsToResume: ['auto-due'],
      executionIdsToResume: ['exec-queued', 'exec-working'],
      outboxIdsToReplay: ['outbox-due'],
      interruptIdsToResurface: ['interrupt-current'],
    });
  });
});
