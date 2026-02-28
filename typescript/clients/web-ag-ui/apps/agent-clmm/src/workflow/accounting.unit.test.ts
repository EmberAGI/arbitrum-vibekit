import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from './context.js';

const createCamelotNavSnapshot = vi.fn();

vi.mock('../accounting/snapshot.js', () => ({
  createCamelotNavSnapshot,
}));

describe('createCamelotAccountingSnapshot', () => {
  it('passes selected pool as managed pool fallback', async () => {
    const { createCamelotAccountingSnapshot } = await import('./accounting.js');

    createCamelotNavSnapshot.mockResolvedValue({
      contextId: 'thread-1',
      trigger: 'cycle',
      timestamp: '2026-02-20T00:00:00.000Z',
      protocolId: 'camelot-clmm',
      walletAddress: '0x1111111111111111111111111111111111111111',
      chainId: 42161,
      totalUsd: 1,
      positions: [],
      priceSource: 'unknown',
    });

    const state = {
      thread: {
        operatorConfig: {
          walletAddress: '0x1111111111111111111111111111111111111111',
        },
        selectedPool: {
          address: '0x2222222222222222222222222222222222222222',
        },
        accounting: {
          flowLog: [],
        },
      },
    } as unknown as ClmmState;

    await createCamelotAccountingSnapshot({
      state,
      camelotClient: {} as never,
      trigger: 'cycle',
      threadId: 'thread-1',
    });

    expect(createCamelotNavSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        managedPoolAddresses: ['0x2222222222222222222222222222222222222222'],
      }),
    );
  });

  it('returns null when operator wallet is missing', async () => {
    const { createCamelotAccountingSnapshot } = await import('./accounting.js');
    createCamelotNavSnapshot.mockReset();

    const state = {
      thread: {
        operatorConfig: undefined,
        selectedPool: {
          address: '0x2222222222222222222222222222222222222222',
        },
        accounting: {
          flowLog: [],
        },
      },
    } as unknown as ClmmState;

    const result = await createCamelotAccountingSnapshot({
      state,
      camelotClient: {} as never,
      trigger: 'cycle',
      threadId: 'thread-1',
    });

    expect(result).toBeNull();
    expect(createCamelotNavSnapshot).not.toHaveBeenCalled();
  });
});
