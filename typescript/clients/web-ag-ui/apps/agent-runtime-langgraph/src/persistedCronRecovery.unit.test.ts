import type { MemorySaver } from '@langchain/langgraph';
import { describe, expect, it, vi } from 'vitest';

import {
  resolvePersistedCronRecoveryCandidates,
  restorePersistedCronSchedules,
  restorePersistedCronSchedulesFromCheckpointer,
  type ScheduleThread,
} from './persistedCronRecovery.js';

function encodeCheckpoint(channelValues: Record<string, unknown>, ts: string): string {
  return Buffer.from(
    JSON.stringify({
      v: 4,
      id: 'checkpoint-1',
      ts,
      channel_values: channelValues,
      channel_versions: {},
      versions_seen: {},
    }),
  ).toString('base64');
}

describe('resolvePersistedCronRecoveryCandidates', () => {
  it('recovers cron for active configured threads after restart', () => {
    const storage = {
      'thread-active': {
        '': {
          'checkpoint-active': [
            encodeCheckpoint(
              {
                private: {
                  bootstrapped: true,
                  pollIntervalMs: 45_000,
                  cronScheduled: true,
                },
                thread: {
                  lifecycle: { phase: 'active' },
                  operatorConfig: { walletAddress: '0x1111111111111111111111111111111111111111' },
                  selectedPool: { address: '0xpool' },
                },
              },
              '2026-03-10T22:45:00.000Z',
            ),
            '{}',
            '',
          ],
        },
      },
      'thread-onboarding': {
        '': {
          'checkpoint-onboarding': [
            encodeCheckpoint(
              {
                private: {
                  bootstrapped: true,
                  pollIntervalMs: 30_000,
                  cronScheduled: true,
                },
                thread: {
                  lifecycle: { phase: 'onboarding' },
                  operatorConfig: { walletAddress: '0x2222222222222222222222222222222222222222' },
                  selectedPool: { address: '0xpool' },
                },
              },
              '2026-03-10T22:45:00.000Z',
            ),
            '{}',
            '',
          ],
        },
      },
    };

    const candidates = resolvePersistedCronRecoveryCandidates(storage);

    expect(candidates).toEqual([
      {
        threadId: 'thread-active',
        pollIntervalMs: 45_000,
      },
    ]);
  });

  it('ignores active threads that are not marked as previously cron-scheduled', () => {
    const storage = {
      'thread-active': {
        '': {
          'checkpoint-active': [
            encodeCheckpoint(
              {
                private: {
                  bootstrapped: true,
                  pollIntervalMs: 45_000,
                  cronScheduled: false,
                },
                thread: {
                  lifecycle: { phase: 'active' },
                  operatorConfig: { walletAddress: '0x1111111111111111111111111111111111111111' },
                  selectedPool: { address: '0xpool' },
                },
              },
              '2026-03-10T22:45:00.000Z',
            ),
            '{}',
            '',
          ],
        },
      },
    };

    expect(resolvePersistedCronRecoveryCandidates(storage)).toEqual([]);
  });

  it('restores one in-memory cron schedule per eligible thread', () => {
    const storage = {
      'thread-active': {
        '': {
          'checkpoint-active': [
            encodeCheckpoint(
              {
                private: {
                  bootstrapped: true,
                  pollIntervalMs: 45_000,
                  cronScheduled: true,
                },
                thread: {
                  lifecycle: { phase: 'active' },
                  operatorConfig: { walletAddress: '0x1111111111111111111111111111111111111111' },
                  selectedPool: { address: '0xpool' },
                },
              },
              '2026-03-10T22:45:00.000Z',
            ),
            '{}',
            '',
          ],
        },
      },
    };

    const scheduleThread = vi.fn<ScheduleThread>();

    const candidates = restorePersistedCronSchedules({
      storage,
      scheduleThread,
    });

    expect(candidates).toEqual([
      {
        threadId: 'thread-active',
        pollIntervalMs: 45_000,
      },
    ]);
    expect(scheduleThread).toHaveBeenCalledTimes(1);
    expect(scheduleThread).toHaveBeenCalledWith('thread-active', 45_000);
  });

  it('runs checkpointer-backed cron restoration only once per process', async () => {
    const storage = {
      'thread-active': {
        '': {
          'checkpoint-active': [
            encodeCheckpoint(
              {
                private: {
                  bootstrapped: true,
                  pollIntervalMs: 45_000,
                  cronScheduled: true,
                },
                thread: {
                  lifecycle: { phase: 'active' },
                  operatorConfig: { walletAddress: '0x1111111111111111111111111111111111111111' },
                  selectedPool: { address: '0xpool' },
                },
              },
              '2026-03-10T22:45:00.000Z',
            ),
            '{}',
            '',
          ],
        },
      },
    };

    const scheduleThread = vi.fn<ScheduleThread>();
    const loadCheckpointer = vi.fn((): Promise<MemorySaver> => Promise.resolve({ storage } as MemorySaver));

    await restorePersistedCronSchedulesFromCheckpointer(scheduleThread, loadCheckpointer);
    await restorePersistedCronSchedulesFromCheckpointer(scheduleThread, loadCheckpointer);

    expect(loadCheckpointer).toHaveBeenCalledTimes(1);
    expect(scheduleThread).toHaveBeenCalledTimes(1);
    expect(scheduleThread).toHaveBeenCalledWith('thread-active', 45_000);
  });
});
