import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CamelotPool, ResolvedOperatorConfig } from '../../domain/types.js';
import type { ClmmState } from '../context.js';

import { fireCommandNode } from './fireCommand.js';

const {
  appendFlowLogHistoryMock,
  appendTransactionHistoryMock,
  cancelCronForThreadMock,
  copilotkitEmitStateMock,
  executeDecisionMock,
  fetchPoolSnapshotMock,
  getCamelotClientMock,
  getOnchainClientsMock,
  loadFlowLogHistoryMock,
} = vi.hoisted(() => ({
  appendFlowLogHistoryMock: vi.fn(),
  appendTransactionHistoryMock: vi.fn(),
  cancelCronForThreadMock: vi.fn(),
  copilotkitEmitStateMock: vi.fn(),
  executeDecisionMock: vi.fn(),
  fetchPoolSnapshotMock: vi.fn(),
  getCamelotClientMock: vi.fn(),
  getOnchainClientsMock: vi.fn(),
  loadFlowLogHistoryMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('../cronScheduler.js', () => ({
  cancelCronForThread: cancelCronForThreadMock,
}));

vi.mock('../clientFactory.js', () => ({
  getCamelotClient: getCamelotClientMock,
  getOnchainClients: getOnchainClientsMock,
}));

vi.mock('../execution.js', () => ({
  executeDecision: executeDecisionMock,
}));

vi.mock('../../clients/emberApi.js', () => ({
  fetchPoolSnapshot: fetchPoolSnapshotMock,
}));

vi.mock('../historyStore.js', () => ({
  appendFlowLogHistory: appendFlowLogHistoryMock,
  appendTransactionHistory: appendTransactionHistoryMock,
  loadFlowLogHistory: loadFlowLogHistoryMock,
}));

function makePool(): CamelotPool {
  return {
    address: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
    token0: { address: '0xtoken0', symbol: 'TK0', decimals: 18, usdPrice: 2000 },
    token1: { address: '0xtoken1', symbol: 'TK1', decimals: 6, usdPrice: 1 },
    tickSpacing: 10,
    tick: -200063,
    liquidity: '1',
  };
}

describe('fireCommandNode (CLMM)', () => {
  beforeEach(() => {
    appendFlowLogHistoryMock.mockReset();
    appendTransactionHistoryMock.mockReset();
    cancelCronForThreadMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    executeDecisionMock.mockReset();
    fetchPoolSnapshotMock.mockReset();
    getCamelotClientMock.mockReset();
    getOnchainClientsMock.mockReset();
    loadFlowLogHistoryMock.mockReset();
  });

  it('recovers selectedPool from Ember snapshot during fire when operator config exists', async () => {
    const threadId = 'thread-1';
    const operatorConfig: ResolvedOperatorConfig = {
      walletAddress: '0x0000000000000000000000000000000000000001',
      baseContributionUsd: 10,
      autoCompoundFees: true,
      manualBandwidthBps: 125,
    };
    const selectedPool = makePool();

    fetchPoolSnapshotMock.mockResolvedValue(selectedPool);
    loadFlowLogHistoryMock.mockResolvedValue([]);
    appendFlowLogHistoryMock.mockResolvedValue(undefined);
    appendTransactionHistoryMock.mockResolvedValue(undefined);
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    getCamelotClientMock.mockReturnValue({});
    getOnchainClientsMock.mockResolvedValue({});
    executeDecisionMock.mockResolvedValue({
      txHash: '0xabc123',
      gasSpentWei: 1n,
      flowEvents: [],
    });

    const state = {
      thread: {
        operatorInput: {
          poolAddress: selectedPool.address,
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
        },
        operatorConfig,
        selectedPool: undefined,
        delegationsBypassActive: true,
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { events: [], telemetry: [] },
        transactionHistory: [],
        profile: { pools: [], allowedPools: [] },
        metrics: { cyclesSinceRebalance: 0, staleCycles: 0, rebalanceCycles: 0, iteration: 9 },
        accounting: {
          navSnapshots: [],
          flowLog: [],
          latestNavSnapshot: undefined,
          lastUpdated: undefined,
          lifecycleStart: undefined,
          lifecycleEnd: undefined,
          initialAllocationUsd: undefined,
          cashUsd: undefined,
          positionsUsd: undefined,
          aumUsd: 10,
          lifetimePnlUsd: undefined,
          lifetimeReturnPct: undefined,
          highWaterMarkUsd: undefined,
          apy: undefined,
        },
      },
      private: {},
      messages: [],
    } as unknown as ClmmState;

    const result = await fireCommandNode(state, { configurable: { thread_id: threadId } } as never);

    expect(cancelCronForThreadMock).toHaveBeenCalledWith(threadId);
    expect(fetchPoolSnapshotMock).toHaveBeenCalledWith(
      expect.anything(),
      selectedPool.address,
      42161,
    );
    expect(executeDecisionMock).toHaveBeenCalled();
    const firstCall = executeDecisionMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const firstArg = firstCall?.[0] as { pool?: { address?: unknown } };
    expect(firstArg.pool?.address).toBe(selectedPool.address);

    const view = (result as { thread: { task?: unknown } }).thread;
    const task = view.task as { taskStatus?: { state?: unknown } };
    expect(task.taskStatus?.state).toBe('completed');
  });

  it("withdraws liquidity on fire and records an unwind txHash when onboarding is complete", async () => {
    const threadId = 'thread-1';
    const operatorConfig: ResolvedOperatorConfig = {
      walletAddress: '0x0000000000000000000000000000000000000001',
      baseContributionUsd: 10,
      autoCompoundFees: true,
      manualBandwidthBps: 125,
    };
    const selectedPool = makePool();

    loadFlowLogHistoryMock.mockResolvedValue([]);
    appendFlowLogHistoryMock.mockResolvedValue(undefined);
    appendTransactionHistoryMock.mockResolvedValue(undefined);
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    getCamelotClientMock.mockReturnValue({});
    getOnchainClientsMock.mockResolvedValue({});
    executeDecisionMock.mockResolvedValue({
      txHash: '0xdeadbeef',
      gasSpentWei: 1n,
      flowEvents: [],
    });

    const state = {
      thread: {
        operatorConfig,
        selectedPool,
        delegationsBypassActive: true,
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { events: [], telemetry: [] },
        transactionHistory: [],
        profile: { pools: [], allowedPools: [] },
        metrics: { cyclesSinceRebalance: 0, staleCycles: 0, rebalanceCycles: 0, iteration: 8 },
        accounting: {
          navSnapshots: [],
          flowLog: [],
          latestNavSnapshot: undefined,
          lastUpdated: undefined,
          lifecycleStart: undefined,
          lifecycleEnd: undefined,
          initialAllocationUsd: undefined,
          cashUsd: undefined,
          positionsUsd: undefined,
          aumUsd: 10,
          lifetimePnlUsd: undefined,
          lifetimeReturnPct: undefined,
          highWaterMarkUsd: undefined,
          apy: undefined,
        },
      },
      private: {},
      messages: [],
    } as unknown as ClmmState;

    const result = await fireCommandNode(state, { configurable: { thread_id: threadId } } as never);

    expect(cancelCronForThreadMock).toHaveBeenCalledWith(threadId);
    expect(executeDecisionMock).toHaveBeenCalled();
    const firstCall = executeDecisionMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const firstArg = firstCall?.[0] as {
      action?: { kind?: unknown };
      pool?: { address?: unknown };
    };
    expect(firstArg.action?.kind).toBe('exit-range');
    expect(firstArg.pool?.address).toBe(selectedPool.address);
    expect(appendTransactionHistoryMock).toHaveBeenCalled();

    const view = (result as { thread: { task?: unknown; transactionHistory?: unknown } }).thread;
    const task = view.task as { taskStatus?: { state?: unknown } };
    expect(task.taskStatus?.state).toBe('completed');

    const history = view.transactionHistory as Array<{ txHash?: string; action?: string }>;
    expect(history).toHaveLength(1);
    expect(history[0]?.action).toBe('withdraw');
    expect(history[0]?.txHash).toBe('0xdeadbeef');
  });

  it('marks fire as completed (not failed) when managed pool metadata is unavailable', async () => {
    const state = {
      thread: {
        operatorConfig: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
          autoCompoundFees: true,
          manualBandwidthBps: 125,
        },
        selectedPool: undefined,
        operatorInput: undefined,
        delegationsBypassActive: true,
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { events: [], telemetry: [] },
        transactionHistory: [],
        profile: { pools: [], allowedPools: [] },
        metrics: { cyclesSinceRebalance: 0, staleCycles: 0, rebalanceCycles: 0, iteration: 3 },
        accounting: {
          navSnapshots: [],
          flowLog: [],
          latestNavSnapshot: undefined,
          lastUpdated: undefined,
          lifecycleStart: undefined,
          lifecycleEnd: undefined,
          initialAllocationUsd: undefined,
          cashUsd: undefined,
          positionsUsd: undefined,
          aumUsd: 10,
          lifetimePnlUsd: undefined,
          lifetimeReturnPct: undefined,
          highWaterMarkUsd: undefined,
          apy: undefined,
        },
      },
      private: {},
      messages: [],
    } as unknown as ClmmState;

    const result = await fireCommandNode(state, {} as never);

    expect(executeDecisionMock).not.toHaveBeenCalled();
    const view = (result as { thread: { task?: unknown } }).thread;
    const task = view.task as { taskStatus?: { state?: unknown; message?: { content?: unknown } } };
    expect(task.taskStatus?.state).toBe('completed');
    expect(task.taskStatus?.message?.content).toContain('pool metadata is unavailable');
  });

  it('uses metrics.lastSnapshot as fallback pool metadata when selectedPool is missing', async () => {
    const fallbackPool = makePool();

    loadFlowLogHistoryMock.mockResolvedValue([]);
    appendFlowLogHistoryMock.mockResolvedValue(undefined);
    appendTransactionHistoryMock.mockResolvedValue(undefined);
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    getCamelotClientMock.mockReturnValue({});
    getOnchainClientsMock.mockResolvedValue({});
    executeDecisionMock.mockResolvedValue({
      txHash: '0xbeef',
      gasSpentWei: 1n,
      flowEvents: [],
    });

    const state = {
      thread: {
        operatorConfig: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
          autoCompoundFees: true,
          manualBandwidthBps: 125,
        },
        selectedPool: undefined,
        operatorInput: undefined,
        delegationsBypassActive: true,
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { events: [], telemetry: [] },
        transactionHistory: [],
        profile: { pools: [], allowedPools: [] },
        metrics: {
          lastSnapshot: fallbackPool,
          cyclesSinceRebalance: 0,
          staleCycles: 0,
          rebalanceCycles: 0,
          iteration: 4,
        },
        accounting: {
          navSnapshots: [],
          flowLog: [],
          latestNavSnapshot: undefined,
          lastUpdated: undefined,
          lifecycleStart: undefined,
          lifecycleEnd: undefined,
          initialAllocationUsd: undefined,
          cashUsd: undefined,
          positionsUsd: undefined,
          aumUsd: 10,
          lifetimePnlUsd: undefined,
          lifetimeReturnPct: undefined,
          highWaterMarkUsd: undefined,
          apy: undefined,
        },
      },
      private: {},
      messages: [],
    } as unknown as ClmmState;

    const result = await fireCommandNode(state, {} as never);

    expect(fetchPoolSnapshotMock).not.toHaveBeenCalled();
    expect(executeDecisionMock).toHaveBeenCalled();
    const firstCall = executeDecisionMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const firstArg = firstCall?.[0] as { pool?: { address?: unknown } };
    expect(firstArg.pool?.address).toBe(fallbackPool.address);
    const view = (result as { thread: { task?: unknown } }).thread;
    const task = view.task as { taskStatus?: { state?: unknown } };
    expect(task.taskStatus?.state).toBe('completed');
  });
});
