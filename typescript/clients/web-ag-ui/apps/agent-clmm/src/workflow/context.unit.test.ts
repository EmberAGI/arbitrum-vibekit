import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from './context.js';

type ViewUpdate = Partial<ClmmState['view']>;

type ViewChannel = {
  fromCheckpoint: (checkpoint?: ClmmState['view']) => {
    update: (values: ViewUpdate[]) => boolean;
    get: () => ClmmState['view'];
  };
};

type Transaction = ClmmState['view']['transactionHistory'][number];
type NavSnapshot = ClmmState['view']['accounting']['navSnapshots'][number];
type FlowLogEvent = ClmmState['view']['accounting']['flowLog'][number];

const STATE_HISTORY_LIMIT = 100;
const ACCOUNTING_HISTORY_LIMIT = 200;

vi.mock('../domain/types.js', () => ({}));

const buildTransactions = (count: number): Transaction[] =>
  Array.from({ length: count }, (_, index) => ({
    cycle: index,
    action: 'test',
    status: 'success',
    timestamp: new Date(index).toISOString(),
  }));

const buildNavSnapshots = (count: number): NavSnapshot[] =>
  Array.from({ length: count }, (_, index) => ({
    contextId: `ctx-${index}`,
    trigger: 'cycle',
    timestamp: new Date(index).toISOString(),
    protocolId: 'camelot',
    walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    chainId: 42161,
    totalUsd: index + 1,
    positions: [],
    priceSource: 'ember',
  }));

const buildFlowLog = (count: number): FlowLogEvent[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `flow-${index}`,
    timestamp: new Date(index).toISOString(),
    contextId: `ctx-${index}`,
    chainId: 42161,
    type: 'hire',
  }));

describe('ClmmStateAnnotation view reducer history limits', () => {
  it('caps transaction history at the configured state limit', async () => {
    vi.resetModules();
    const { ClmmStateAnnotation } = await import('./context.js');
    const channel = (ClmmStateAnnotation.spec.view as unknown as ViewChannel).fromCheckpoint();
    const transactions = buildTransactions(STATE_HISTORY_LIMIT + 5);
    const update: ViewUpdate = {
      transactionHistory: transactions,
    };

    channel.update([update]);
    const view = channel.get();

    expect(view.transactionHistory).toHaveLength(STATE_HISTORY_LIMIT);
    expect(view.transactionHistory[0]?.cycle).toBe(5);
    expect(view.transactionHistory.at(-1)?.cycle).toBe(STATE_HISTORY_LIMIT + 4);
  }, 20_000);

  it('caps accounting history lists at the configured accounting limit', async () => {
    vi.resetModules();
    const { ClmmStateAnnotation } = await import('./context.js');
    const channel = (ClmmStateAnnotation.spec.view as unknown as ViewChannel).fromCheckpoint();
    const navSnapshots = buildNavSnapshots(ACCOUNTING_HISTORY_LIMIT + 5);
    const flowLog = buildFlowLog(ACCOUNTING_HISTORY_LIMIT + 5);
    const update: ViewUpdate = {
      accounting: {
        navSnapshots,
        flowLog,
      },
    };

    channel.update([update]);
    const view = channel.get();

    expect(view.accounting.navSnapshots).toHaveLength(ACCOUNTING_HISTORY_LIMIT);
    expect(view.accounting.flowLog).toHaveLength(ACCOUNTING_HISTORY_LIMIT);
    expect(view.accounting.navSnapshots[0]?.contextId).toBe('ctx-5');
    expect(view.accounting.flowLog[0]?.id).toBe('flow-5');
    expect(view.accounting.navSnapshots.at(-1)?.contextId).toBe(
      `ctx-${ACCOUNTING_HISTORY_LIMIT + 4}`,
    );
    expect(view.accounting.flowLog.at(-1)?.id).toBe(`flow-${ACCOUNTING_HISTORY_LIMIT + 4}`);
  });
});
