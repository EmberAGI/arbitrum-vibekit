import { describe, expect, it } from 'vitest';

import { buildActionFingerprint, createOutboxIntent, recoverPendingOutboxIntents } from './index.js';

describe('outbox', () => {
  it('builds a stable fingerprint and stores pending outbox intents with that dedupe key', () => {
    const fingerprintA = buildActionFingerprint({
      walletAddress: '0xabc',
      actionKind: 'swap',
      intentPayload: {
        token: 'USDC',
        amount: '100',
      },
    });
    const fingerprintB = buildActionFingerprint({
      walletAddress: '0xabc',
      actionKind: 'swap',
      intentPayload: {
        amount: '100',
        token: 'USDC',
      },
    });

    expect(fingerprintA).toBe(fingerprintB);
    expect(
      createOutboxIntent({
        outboxId: 'outbox-1',
        executionId: 'exec-1',
        threadId: 'thread-1',
        walletAddress: '0xabc',
        actionKind: 'swap',
        intentPayload: {
          token: 'USDC',
          amount: '100',
        },
        availableAt: new Date('2026-03-18T20:00:00.000Z'),
        createdAt: new Date('2026-03-18T20:00:00.000Z'),
      }),
    ).toEqual({
      outboxId: 'outbox-1',
      executionId: 'exec-1',
      threadId: 'thread-1',
      walletAddress: '0xabc',
      actionKind: 'swap',
      actionFingerprint: fingerprintA,
      intentPayload: {
        token: 'USDC',
        amount: '100',
      },
      status: 'pending',
      availableAt: new Date('2026-03-18T20:00:00.000Z'),
      deliveredAt: null,
      createdAt: new Date('2026-03-18T20:00:00.000Z'),
    });
  });

  it('recovers only pending outbox intents that are due for dispatch', () => {
    const now = new Date('2026-03-18T20:00:00.000Z');

    expect(
      recoverPendingOutboxIntents({
        now,
        intents: [
          {
            outboxId: 'due-pending',
            status: 'pending',
            availableAt: new Date('2026-03-18T19:59:00.000Z'),
            deliveredAt: null,
          },
          {
            outboxId: 'future-pending',
            status: 'pending',
            availableAt: new Date('2026-03-18T20:05:00.000Z'),
            deliveredAt: null,
          },
          {
            outboxId: 'already-delivered',
            status: 'delivered',
            availableAt: new Date('2026-03-18T19:59:00.000Z'),
            deliveredAt: new Date('2026-03-18T19:59:30.000Z'),
          },
        ],
      }).map((intent) => intent.outboxId),
    ).toEqual(['due-pending']);
  });
});
