import { END, START, StateGraph } from '@langchain/langgraph';
import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../src/workflow/context.js';

type Transaction = ClmmState['thread']['transactionHistory'][number];
type Telemetry = ClmmState['thread']['activity']['telemetry'][number];
type NavSnapshot = ClmmState['thread']['accounting']['navSnapshots'][number];
type FlowLogEvent = ClmmState['thread']['accounting']['flowLog'][number];

type ViewUpdate = Partial<ClmmState['thread']>;

const STATE_HISTORY_LIMIT = 100;
const ACCOUNTING_HISTORY_LIMIT = 200;

vi.mock('../src/domain/types.js', () => ({}));

const buildTelemetry = (count: number): Telemetry[] =>
  Array.from({ length: count }, (_, index) => ({
    cycle: index,
    poolAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    midPrice: 1,
    action: 'hold',
    reason: 'test',
    timestamp: new Date(index).toISOString(),
  }));

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

describe('state history limits in graph execution', () => {
  it('truncates view histories to configured limits during graph runs', async () => {
    vi.resetModules();
    const { ClmmStateAnnotation } = await import('../src/workflow/context.js');
    const telemetry = buildTelemetry(STATE_HISTORY_LIMIT + 20);
    const transactions = buildTransactions(STATE_HISTORY_LIMIT + 20);
    const navSnapshots = buildNavSnapshots(ACCOUNTING_HISTORY_LIMIT + 20);
    const flowLog = buildFlowLog(ACCOUNTING_HISTORY_LIMIT + 20);

    const graph = new StateGraph(ClmmStateAnnotation)
      .addNode('apply', (): { thread: ViewUpdate } => ({
        thread: {
          activity: { telemetry },
          transactionHistory: transactions,
          accounting: {
            navSnapshots,
            flowLog,
          },
        },
      }))
      .addEdge(START, 'apply')
      .addEdge('apply', END)
      .compile();

    const result = await graph.invoke({});

    expect(result.thread.activity.telemetry).toHaveLength(STATE_HISTORY_LIMIT);
    expect(result.thread.transactionHistory).toHaveLength(STATE_HISTORY_LIMIT);
    expect(result.thread.accounting.navSnapshots).toHaveLength(ACCOUNTING_HISTORY_LIMIT);
    expect(result.thread.accounting.flowLog).toHaveLength(ACCOUNTING_HISTORY_LIMIT);
    expect(result.thread.activity.telemetry[0]?.cycle).toBe(20);
    expect(result.thread.transactionHistory[0]?.cycle).toBe(20);
    expect(result.thread.accounting.navSnapshots[0]?.contextId).toBe('ctx-20');
    expect(result.thread.accounting.flowLog[0]?.id).toBe('flow-20');
  });
});
