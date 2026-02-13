import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { fireCommandNode } from './fireCommand.js';

type EmitStatePayload = {
  view?: {
    activity?: {
      events?: Array<{ message?: unknown }>;
    };
  };
};

function getEmittedStatusMessage(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const view = (payload as EmitStatePayload).view;
  const message = view?.activity?.events?.[0]?.message;
  return typeof message === 'string' ? message : undefined;
}

const {
  copilotkitEmitStateMock,
  cancelCronForThreadMock,
  executeUnwindMock,
  getOnchainClientsMock,
  resolvePendleTxExecutionModeMock,
  resolvePendleChainIdsMock,
} = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
  cancelCronForThreadMock: vi.fn(),
  executeUnwindMock: vi.fn(),
  getOnchainClientsMock: vi.fn(),
  resolvePendleTxExecutionModeMock: vi.fn(),
  resolvePendleChainIdsMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('../cronScheduler.js', () => ({
  cancelCronForThread: cancelCronForThreadMock,
}));

vi.mock('../execution.js', () => ({
  executeUnwind: executeUnwindMock,
}));

vi.mock('../clientFactory.js', async (importOriginal) => {
  const actual: unknown = await importOriginal();
  if (typeof actual !== 'object' || actual === null) {
    throw new Error('Unexpected ../clientFactory.js mock import shape');
  }
  return {
    ...(actual as Record<string, unknown>),
    getOnchainClients: getOnchainClientsMock,
  };
});

vi.mock('../../config/constants.js', async (importOriginal) => {
  const actual: unknown = await importOriginal();
  if (typeof actual !== 'object' || actual === null) {
    throw new Error('Unexpected ../../config/constants.js mock import shape');
  }
  return {
    ...(actual as Record<string, unknown>),
    resolvePendleTxExecutionMode: resolvePendleTxExecutionModeMock,
    resolvePendleChainIds: resolvePendleChainIdsMock,
  };
});

const baseState = (): ClmmState =>
  ({
    messages: [],
    copilotkit: { actions: [], context: [] },
    settings: { amount: undefined },
    private: {
      mode: undefined,
      pollIntervalMs: 5_000,
      streamLimit: -1,
      cronScheduled: false,
      bootstrapped: true,
    },
    view: {
      command: undefined,
      task: { id: 'task-1', taskStatus: { state: 'working' } },
      poolArtifact: undefined,
      operatorInput: undefined,
      onboarding: undefined,
      fundingTokenInput: undefined,
      selectedPool: undefined,
      operatorConfig: undefined,
      setupComplete: true,
      delegationBundle: undefined,
      haltReason: undefined,
      executionError: undefined,
      delegationsBypassActive: true,
      profile: {
        agentIncome: undefined,
        aum: undefined,
        totalUsers: undefined,
        apy: undefined,
        chains: [],
        protocols: [],
        tokens: [],
        pools: [],
        allowedPools: [],
      },
      activity: { telemetry: [], events: [] },
      metrics: {
        lastSnapshot: undefined,
        previousApy: undefined,
        cyclesSinceRebalance: 0,
        staleCycles: 0,
        iteration: 0,
        latestCycle: undefined,
      },
      transactionHistory: [],
    },
  }) as unknown as ClmmState;

describe('fireCommandNode', () => {
  beforeEach(() => {
    copilotkitEmitStateMock.mockReset();
    cancelCronForThreadMock.mockReset();
    executeUnwindMock.mockReset();
    getOnchainClientsMock.mockReset();
    resolvePendleTxExecutionModeMock.mockReset();
    resolvePendleChainIdsMock.mockReset();
  });

  it('does not attempt unwind when task is already terminal', async () => {
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    const state = baseState();
    state.view.task = { id: 'task-1', taskStatus: { state: 'completed' } };

    const result = await fireCommandNode(state, {});

    expect(executeUnwindMock).not.toHaveBeenCalled();
    expect(result.view.command).toBe('fire');
    expect(result.view.task?.taskStatus.state).toBe('completed');
  });

  it('cancels cron when thread_id is present', async () => {
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    const state = baseState();
    state.view.operatorConfig = {
      walletAddress: '0x0000000000000000000000000000000000000001',
      executionWalletAddress: '0x0000000000000000000000000000000000000001',
      baseContributionUsd: 10,
      fundingTokenAddress: '0x0000000000000000000000000000000000000002',
      targetYieldToken: {
        marketAddress: '0x0000000000000000000000000000000000000003',
        ptAddress: '0x0000000000000000000000000000000000000004',
        ytAddress: '0x0000000000000000000000000000000000000005',
        ptSymbol: 'PT',
        ytSymbol: 'YT',
        underlyingSymbol: 'USDai',
        apy: 1,
        maturity: '2030-01-01',
      },
    };

    resolvePendleTxExecutionModeMock.mockReturnValue('plan');
    resolvePendleChainIdsMock.mockReturnValue(['42161']);
    executeUnwindMock.mockResolvedValue({ txHashes: [], positionCount: 0, transactionCount: 0 });

    await fireCommandNode(state, { configurable: { thread_id: 'thread-1' } });

    expect(cancelCronForThreadMock).toHaveBeenCalledWith('thread-1');
  });

  it('does not attempt unwind when onboarding is incomplete (no operatorConfig) and marks task canceled', async () => {
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    const state = baseState();
    state.view.operatorConfig = undefined;

    const result = await fireCommandNode(state, {});

    expect(executeUnwindMock).not.toHaveBeenCalled();
    expect(result.view.command).toBe('fire');
    expect(result.view.task?.taskStatus.state).toBe('canceled');
  });

  it('attempts unwind then completes when onboarding is complete', async () => {
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    const state = baseState();
    state.view.operatorConfig = {
      walletAddress: '0x0000000000000000000000000000000000000001',
      executionWalletAddress: '0x0000000000000000000000000000000000000001',
      baseContributionUsd: 10,
      fundingTokenAddress: '0x0000000000000000000000000000000000000002',
      targetYieldToken: {
        marketAddress: '0x0000000000000000000000000000000000000003',
        ptAddress: '0x0000000000000000000000000000000000000004',
        ytAddress: '0x0000000000000000000000000000000000000005',
        ptSymbol: 'PT',
        ytSymbol: 'YT',
        underlyingSymbol: 'USDai',
        apy: 1,
        maturity: '2030-01-01',
      },
    };

    resolvePendleTxExecutionModeMock.mockReturnValue('plan');
    resolvePendleChainIdsMock.mockReturnValue(['42161']);
    executeUnwindMock.mockImplementation(async (params: { onProgress?: (message: string) => void | Promise<void> }) => {
      await params.onProgress?.('Unwind: planned 0 transaction(s)');
      return { txHashes: [], positionCount: 1, transactionCount: 0 };
    });

    const result = await fireCommandNode(state, {});

    expect(executeUnwindMock).toHaveBeenCalledTimes(1);
    expect(result.view.command).toBe('fire');
    expect(result.view.task?.taskStatus.state).toBe('completed');
    expect(copilotkitEmitStateMock).toHaveBeenCalled();
    const emittedMessages = copilotkitEmitStateMock.mock.calls
      .map((call) => getEmittedStatusMessage(call[1] as unknown))
      .filter((value): value is string => typeof value === 'string');
    expect(emittedMessages).toContain('Unwind: planned 0 transaction(s)');
  });

  it('records unwind tx hashes in transactionHistory', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    try {
      copilotkitEmitStateMock.mockResolvedValue(undefined);
      const state = baseState();
      state.view.metrics.iteration = 12;
      state.view.operatorConfig = {
        walletAddress: '0x0000000000000000000000000000000000000001',
        executionWalletAddress: '0x0000000000000000000000000000000000000001',
        baseContributionUsd: 10,
        fundingTokenAddress: '0x0000000000000000000000000000000000000002',
        targetYieldToken: {
          marketAddress: '0x0000000000000000000000000000000000000003',
          ptAddress: '0x0000000000000000000000000000000000000004',
          ytAddress: '0x0000000000000000000000000000000000000005',
          ptSymbol: 'PT',
          ytSymbol: 'YT',
          underlyingSymbol: 'USDai',
          apy: 1,
          maturity: '2030-01-01',
        },
      };

      resolvePendleTxExecutionModeMock.mockReturnValue('execute');
      resolvePendleChainIdsMock.mockReturnValue(['42161']);
      executeUnwindMock.mockResolvedValue({
        txHashes: ['0xdeadbeef'],
        positionCount: 1,
        transactionCount: 1,
      });

      const result = await fireCommandNode(state, {});

      expect(result.view.transactionHistory).toEqual([
        {
          cycle: 12,
          action: 'unwind',
          txHash: '0xdeadbeef',
          status: 'success',
          reason: 'fire',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('includes last unwind tx hash in the completion status message', async () => {
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    const state = baseState();
    state.view.operatorConfig = {
      walletAddress: '0x0000000000000000000000000000000000000001',
      executionWalletAddress: '0x0000000000000000000000000000000000000001',
      baseContributionUsd: 10,
      fundingTokenAddress: '0x0000000000000000000000000000000000000002',
      targetYieldToken: {
        marketAddress: '0x0000000000000000000000000000000000000003',
        ptAddress: '0x0000000000000000000000000000000000000004',
        ytAddress: '0x0000000000000000000000000000000000000005',
        ptSymbol: 'PT',
        ytSymbol: 'YT',
        underlyingSymbol: 'USDai',
        apy: 1,
        maturity: '2030-01-01',
      },
    };

    resolvePendleTxExecutionModeMock.mockReturnValue('execute');
    resolvePendleChainIdsMock.mockReturnValue(['42161']);
    executeUnwindMock.mockResolvedValue({
      txHashes: ['0xdeadbeef'],
      positionCount: 1,
      transactionCount: 1,
    });

    await fireCommandNode(state, {});

    const lastCall = copilotkitEmitStateMock.mock.calls.at(-1);
    const lastMessage = getEmittedStatusMessage(lastCall?.[1] as unknown);
    expect(typeof lastMessage).toBe('string');
    expect(lastMessage).toContain('0xdeadbeef');
  });

  it('completes with a "nothing to unwind" message when no positions are found', async () => {
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    const state = baseState();
    state.view.operatorConfig = {
      walletAddress: '0x0000000000000000000000000000000000000001',
      executionWalletAddress: '0x0000000000000000000000000000000000000001',
      baseContributionUsd: 10,
      fundingTokenAddress: '0x0000000000000000000000000000000000000002',
      targetYieldToken: {
        marketAddress: '0x0000000000000000000000000000000000000003',
        ptAddress: '0x0000000000000000000000000000000000000004',
        ytAddress: '0x0000000000000000000000000000000000000005',
        ptSymbol: 'PT',
        ytSymbol: 'YT',
        underlyingSymbol: 'USDai',
        apy: 1,
        maturity: '2030-01-01',
      },
    };

    resolvePendleTxExecutionModeMock.mockReturnValue('plan');
    resolvePendleChainIdsMock.mockReturnValue(['42161']);
    executeUnwindMock.mockResolvedValue({ txHashes: [], positionCount: 0, transactionCount: 0 });

    const result = await fireCommandNode(state, {});

    expect(result.view.task?.taskStatus.state).toBe('completed');
    const lastCall = copilotkitEmitStateMock.mock.calls.at(-1);
    const lastMessage = getEmittedStatusMessage(lastCall?.[1] as unknown);
    expect(typeof lastMessage).toBe('string');
    expect(lastMessage).toContain('No positions found to unwind');
  });

  it('fails the task when unwind throws after exhausting retries', async () => {
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    const state = baseState();
    state.view.operatorConfig = {
      walletAddress: '0x0000000000000000000000000000000000000001',
      executionWalletAddress: '0x0000000000000000000000000000000000000001',
      baseContributionUsd: 10,
      fundingTokenAddress: '0x0000000000000000000000000000000000000002',
      targetYieldToken: {
        marketAddress: '0x0000000000000000000000000000000000000003',
        ptAddress: '0x0000000000000000000000000000000000000004',
        ytAddress: '0x0000000000000000000000000000000000000005',
        ptSymbol: 'PT',
        ytSymbol: 'YT',
        underlyingSymbol: 'USDai',
        apy: 1,
        maturity: '2030-01-01',
      },
    };

    resolvePendleTxExecutionModeMock.mockReturnValue('plan');
    resolvePendleChainIdsMock.mockReturnValue(['42161']);
    executeUnwindMock.mockRejectedValueOnce(new Error('boom'));

    const result = await fireCommandNode(state, {});

    expect(executeUnwindMock).toHaveBeenCalledTimes(1);
    expect(result.view.command).toBe('fire');
    expect(result.view.task?.taskStatus.state).toBe('failed');
    const lastCall = copilotkitEmitStateMock.mock.calls.at(-1);
    const lastMessage = getEmittedStatusMessage(lastCall?.[1] as unknown);
    expect(typeof lastMessage).toBe('string');
    expect(lastMessage).toContain('ERROR: Unwind failed after 2 retries');
  });
});
