import { Command } from '@langchain/langgraph';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClmmState, ClmmUpdate } from '../context.js';

import { pollCycleNode } from './pollCycle.js';

const { executeRebalanceMock, executeCompoundMock, executeRolloverMock } = vi.hoisted(() => ({
  executeRebalanceMock: vi.fn(),
  executeCompoundMock: vi.fn(),
  executeRolloverMock: vi.fn(),
}));

const { ensureCronForThreadMock } = vi.hoisted(() => ({
  ensureCronForThreadMock: vi.fn(),
}));

vi.mock('../execution.js', () => ({
  executeRebalance: executeRebalanceMock,
  executeCompound: executeCompoundMock,
  executeRollover: executeRolloverMock,
}));

vi.mock('../clientFactory.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    getOnchainClients: vi.fn().mockResolvedValue({}),
  };
});

vi.mock('../cronScheduler.js', () => ({
  ensureCronForThread: ensureCronForThreadMock,
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: vi.fn().mockResolvedValue(undefined),
}));

describe('pollCycleNode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    executeRebalanceMock.mockReset();
    executeCompoundMock.mockReset();
    executeRolloverMock.mockReset();
    ensureCronForThreadMock.mockReset();
    delete process.env.PENDLE_REBALANCE_THRESHOLD_PCT;
    delete process.env.PENDLE_SMOKE_MODE;
  });

  it('refreshes markets via onchain actions and rebalances to best yield', async () => {
    executeRebalanceMock.mockResolvedValue({ lastTxHash: '0xrebalancehash' });
    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/tokenizedYield/markets')) {
        return new Response(
          JSON.stringify({
            markets: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-best' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '6.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-best' },
                  name: 'PT-BEST',
                  symbol: 'PT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-best' },
                  name: 'YT-BEST',
                  symbol: 'YT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusdai' },
                  name: 'USDai',
                  symbol: 'USDai',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
              },
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-current' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '5.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-cur' },
                  name: 'PT-CUR',
                  symbol: 'PT-CUR',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-cur' },
                  name: 'YT-CUR',
                  symbol: 'YT-CUR',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusde' },
                  name: 'USDe',
                  symbol: 'USDe',
                  isNative: false,
                  decimals: 6,
                  iconUri: null,
                  isVetted: true,
                },
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokens')) {
        return new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: { chainId: '42161', address: '0xusdai' },
                name: 'USDai',
                symbol: 'USDai',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
              {
                tokenUid: { chainId: '42161', address: '0xusde' },
                name: 'USDe',
                symbol: 'USDe',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokenizedYield/positions')) {
        return new Response(
          JSON.stringify({
            positions: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-current' },
                pt: {
                  token: {
                    tokenUid: { chainId: '42161', address: '0xpt-cur' },
                    name: 'PT-CUR',
                    symbol: 'PT-CUR',
                    isNative: false,
                    decimals: 18,
                    iconUri: null,
                    isVetted: true,
                  },
                  exactAmount: '100',
                },
                yt: {
                  token: {
                    tokenUid: { chainId: '42161', address: '0xyt-cur' },
                    name: 'YT-CUR',
                    symbol: 'YT-CUR',
                    isNative: false,
                    decimals: 18,
                    iconUri: null,
                    isVetted: true,
                  },
                  exactAmount: '5',
                  claimableRewards: [],
                },
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const state: ClmmState = {
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
        command: 'cycle',
        task: undefined,
        poolArtifact: undefined,
        operatorInput: undefined,
        onboarding: undefined,
        fundingTokenInput: undefined,
        selectedPool: {
          marketAddress: '0xmarket-current',
          ytSymbol: 'YT-CUR',
          underlyingSymbol: 'USDe',
          apy: 5,
          maturity: '2030-01-01',
        },
        operatorConfig: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
          fundingTokenAddress: '0x0000000000000000000000000000000000000002',
          targetYieldToken: {
            marketAddress: '0xmarket-current',
            ytSymbol: 'YT-CUR',
            underlyingSymbol: 'USDe',
            apy: 5,
            maturity: '2030-01-01',
          },
        },
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
    };

    const result = await pollCycleNode(state, {});
    const update = (result as { update?: ClmmUpdate }).update;
    const view = update?.view;

    expect(result).toBeInstanceOf(Command);
    expect(view?.selectedPool?.ytSymbol).toBe('YT-BEST');
    expect(view?.activity?.telemetry?.[0]?.action).toBe('rebalance');
    expect(executeRebalanceMock).toHaveBeenCalledTimes(1);
    expect(view?.activity?.telemetry?.[0]?.txHash).toBe('0xrebalancehash');
  });

  it('falls back to the best market when the selected pool is no longer eligible', async () => {
    executeRebalanceMock.mockResolvedValue({ lastTxHash: '0xrebalancehash' });
    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/tokenizedYield/markets')) {
        return new Response(
          JSON.stringify({
            markets: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-best' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '6.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-best' },
                  name: 'PT-BEST',
                  symbol: 'PT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-best' },
                  name: 'YT-BEST',
                  symbol: 'YT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusdai' },
                  name: 'USDai',
                  symbol: 'USDai',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokens')) {
        return new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: { chainId: '42161', address: '0xusdai' },
                name: 'USDai',
                symbol: 'USDai',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokenizedYield/positions')) {
        return new Response(
          JSON.stringify({
            positions: [],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const state: ClmmState = {
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
        command: 'cycle',
        task: undefined,
        poolArtifact: undefined,
        operatorInput: undefined,
        onboarding: undefined,
        fundingTokenInput: undefined,
        selectedPool: {
          marketAddress: '0xmarket-stale',
          ytSymbol: 'YT-STALE',
          underlyingSymbol: 'USDC',
          apy: 4,
          maturity: '2030-01-01',
        },
        operatorConfig: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
          fundingTokenAddress: '0x0000000000000000000000000000000000000002',
          targetYieldToken: {
            marketAddress: '0xmarket-stale',
            ytSymbol: 'YT-STALE',
            underlyingSymbol: 'USDC',
            apy: 4,
            maturity: '2030-01-01',
          },
        },
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
    };

    const result = await pollCycleNode(state, {});
    const update = (result as { update?: ClmmUpdate }).update;
    const view = update?.view;

    expect(result).toBeInstanceOf(Command);
    expect(view?.haltReason).toBeUndefined();
    expect(view?.selectedPool?.ytSymbol).toBe('YT-BEST');
    expect(view?.activity?.telemetry?.[0]?.action).toBe('hold');
    expect(executeRebalanceMock).not.toHaveBeenCalled();
  });

  it('emits a hold cycle and schedules cron when no rebalance is needed', async () => {
    process.env.PENDLE_REBALANCE_THRESHOLD_PCT = '1.0';
    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/tokenizedYield/markets')) {
        return new Response(
          JSON.stringify({
            markets: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-best' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '5.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-best' },
                  name: 'PT-BEST',
                  symbol: 'PT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-best' },
                  name: 'YT-BEST',
                  symbol: 'YT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusde' },
                  name: 'USDe',
                  symbol: 'USDe',
                  isNative: false,
                  decimals: 6,
                  iconUri: null,
                  isVetted: true,
                },
              },
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-current' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '4.8' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-cur' },
                  name: 'PT-CUR',
                  symbol: 'PT-CUR',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-cur' },
                  name: 'YT-CUR',
                  symbol: 'YT-CUR',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusde' },
                  name: 'USDe',
                  symbol: 'USDe',
                  isNative: false,
                  decimals: 6,
                  iconUri: null,
                  isVetted: true,
                },
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokens')) {
        return new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: { chainId: '42161', address: '0xusde' },
                name: 'USDe',
                symbol: 'USDe',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokenizedYield/positions')) {
        return new Response(
          JSON.stringify({
            positions: [],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const state: ClmmState = {
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
        command: 'cycle',
        task: undefined,
        poolArtifact: undefined,
        operatorInput: undefined,
        onboarding: undefined,
        fundingTokenInput: undefined,
        selectedPool: {
          marketAddress: '0xmarket-current',
          ytSymbol: 'YT-CUR',
          underlyingSymbol: 'USDe',
          apy: 4.8,
          maturity: '2030-01-01',
        },
        operatorConfig: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
          fundingTokenAddress: '0x0000000000000000000000000000000000000002',
          targetYieldToken: {
            marketAddress: '0xmarket-current',
            ytSymbol: 'YT-CUR',
            underlyingSymbol: 'USDe',
            apy: 4.8,
            maturity: '2030-01-01',
          },
        },
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
    };

    const result = await pollCycleNode(state, { configurable: { thread_id: 'thread-1' } });
    const update = (result as { update?: ClmmUpdate }).update;
    const view = update?.view;

    expect(view?.activity?.telemetry?.[0]?.action).toBe('hold');
    expect(update?.private?.cronScheduled).toBe(true);
    expect(ensureCronForThreadMock).toHaveBeenCalledWith('thread-1', 5_000);
    expect(executeRebalanceMock).not.toHaveBeenCalled();
  });

  it('routes back into onboarding when operator config is missing', async () => {
    const state: ClmmState = {
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
        command: 'cycle',
        task: undefined,
        poolArtifact: undefined,
        operatorInput: undefined,
        onboarding: undefined,
        fundingTokenInput: undefined,
        selectedPool: undefined,
        operatorConfig: undefined,
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
    };

    const result = await pollCycleNode(state, {});
    const update = (result as { update?: ClmmUpdate }).update;
    const goto = (result as { goto?: string | string[] }).goto;
    const resolvedGoto = Array.isArray(goto) ? goto[0] : goto;

    expect(result).toBeInstanceOf(Command);
    expect(resolvedGoto).toBe('collectSetupInput');
    expect(update?.view?.haltReason).toBe('');
  });

  it('downgrades to hold in smoke mode when no position exists', async () => {
    process.env.PENDLE_SMOKE_MODE = 'true';

    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/tokenizedYield/markets')) {
        return new Response(
          JSON.stringify({
            markets: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-best' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '6.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-best' },
                  name: 'PT-BEST',
                  symbol: 'PT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-best' },
                  name: 'YT-BEST',
                  symbol: 'YT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusdai' },
                  name: 'USDai',
                  symbol: 'USDai',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
              },
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-current' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '1.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-cur' },
                  name: 'PT-CUR',
                  symbol: 'PT-CUR',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-cur' },
                  name: 'YT-CUR',
                  symbol: 'YT-CUR',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusde' },
                  name: 'USDe',
                  symbol: 'USDe',
                  isNative: false,
                  decimals: 6,
                  iconUri: null,
                  isVetted: true,
                },
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokens')) {
        return new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: { chainId: '42161', address: '0xusdai' },
                name: 'USDai',
                symbol: 'USDai',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
              {
                tokenUid: { chainId: '42161', address: '0xusde' },
                name: 'USDe',
                symbol: 'USDe',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokenizedYield/positions/')) {
        return new Response(
          JSON.stringify({
            positions: [],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const state: ClmmState = {
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
        command: 'cycle',
        task: undefined,
        poolArtifact: undefined,
        operatorInput: undefined,
        onboarding: undefined,
        fundingTokenInput: undefined,
        selectedPool: {
          marketAddress: '0xmarket-current',
          ptSymbol: 'PT-CUR',
          ytSymbol: 'YT-CUR',
          underlyingSymbol: 'USDe',
          apy: 1.0,
          maturity: '2030-01-01',
        },
        operatorConfig: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
          fundingTokenAddress: '0xusdai',
          targetYieldToken: {
            marketAddress: '0xmarket-current',
            ptSymbol: 'PT-CUR',
            ytSymbol: 'YT-CUR',
            underlyingSymbol: 'USDe',
            apy: 1.0,
            maturity: '2030-01-01',
          },
        },
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
    };

    const result = await pollCycleNode(state, { configurable: { thread_id: 'thread-smoke' } });
    const update = (result as { update?: ClmmUpdate }).update;
    const view = update?.view;

    expect(result).toBeInstanceOf(Command);
    expect(view?.activity?.telemetry?.[0]?.action).toBe('hold');
    expect(update?.private?.cronScheduled).toBe(true);
    expect(ensureCronForThreadMock).toHaveBeenCalledWith('thread-smoke', 5_000);
    expect(executeRebalanceMock).not.toHaveBeenCalled();
    expect(executeRolloverMock).not.toHaveBeenCalled();
    expect(executeCompoundMock).not.toHaveBeenCalled();
  });

  it('fails when rebalance data is missing', async () => {
    executeRebalanceMock.mockResolvedValue({ lastTxHash: '0xrebalancehash' });
    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/tokenizedYield/markets')) {
        return new Response(
          JSON.stringify({
            markets: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-best' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '6.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-best' },
                  name: 'PT-BEST',
                  symbol: 'PT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-best' },
                  name: 'YT-BEST',
                  symbol: 'YT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusde' },
                  name: 'USDe',
                  symbol: 'USDe',
                  isNative: false,
                  decimals: 6,
                  iconUri: null,
                  isVetted: true,
                },
              },
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-current' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '4.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-cur' },
                  name: 'PT-CUR',
                  symbol: 'PT-CUR',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-cur' },
                  name: 'YT-CUR',
                  symbol: 'YT-CUR',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusde' },
                  name: 'USDe',
                  symbol: 'USDe',
                  isNative: false,
                  decimals: 6,
                  iconUri: null,
                  isVetted: true,
                },
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokens')) {
        return new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: { chainId: '42161', address: '0xusde' },
                name: 'USDe',
                symbol: 'USDe',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokenizedYield/positions')) {
        return new Response(
          JSON.stringify({
            positions: [],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const state: ClmmState = {
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
        command: 'cycle',
        task: undefined,
        poolArtifact: undefined,
        operatorInput: undefined,
        onboarding: undefined,
        fundingTokenInput: undefined,
        selectedPool: {
          marketAddress: '0xmarket-current',
          ytSymbol: 'YT-CUR',
          underlyingSymbol: 'USDe',
          apy: 4,
          maturity: '2030-01-01',
        },
        operatorConfig: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
          fundingTokenAddress: '0x0000000000000000000000000000000000000002',
          targetYieldToken: {
            marketAddress: '0xmarket-current',
            ytSymbol: 'YT-CUR',
            underlyingSymbol: 'USDe',
            apy: 4,
            maturity: '2030-01-01',
          },
        },
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
    };

    const result = await pollCycleNode(state, {});
    const update = (result as { update?: ClmmUpdate }).update;

    expect(result).toBeInstanceOf(Command);
    const haltReason = update?.view?.haltReason ?? '';
    expect(haltReason).toContain('Missing tokenized yield data needed to rebalance');
    expect(executeRebalanceMock).not.toHaveBeenCalled();
  });

  it('rolls over matured PT positions before rebalancing', async () => {
    executeRolloverMock.mockResolvedValue({ lastTxHash: '0xrolloverhash' });
    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/tokenizedYield/markets')) {
        return new Response(
          JSON.stringify({
            markets: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-best' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '6.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-best' },
                  name: 'PT-BEST',
                  symbol: 'PT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-best' },
                  name: 'YT-BEST',
                  symbol: 'YT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusdai' },
                  name: 'USDai',
                  symbol: 'USDai',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
              },
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-current' },
                expiry: '2024-01-01',
                details: { aggregatedApy: '5.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-cur' },
                  name: 'PT-CUR',
                  symbol: 'PT-CUR',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-cur' },
                  name: 'YT-CUR',
                  symbol: 'YT-CUR',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusde' },
                  name: 'USDe',
                  symbol: 'USDe',
                  isNative: false,
                  decimals: 6,
                  iconUri: null,
                  isVetted: true,
                },
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokens')) {
        return new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: { chainId: '42161', address: '0xusdai' },
                name: 'USDai',
                symbol: 'USDai',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
              {
                tokenUid: { chainId: '42161', address: '0xusde' },
                name: 'USDe',
                symbol: 'USDe',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokenizedYield/positions')) {
        return new Response(
          JSON.stringify({
            positions: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-current' },
                pt: {
                  token: {
                    tokenUid: { chainId: '42161', address: '0xpt-cur' },
                    name: 'PT-CUR',
                    symbol: 'PT-CUR',
                    isNative: false,
                    decimals: 18,
                    iconUri: null,
                    isVetted: true,
                  },
                  exactAmount: '100',
                },
                yt: {
                  token: {
                    tokenUid: { chainId: '42161', address: '0xyt-cur' },
                    name: 'YT-CUR',
                    symbol: 'YT-CUR',
                    isNative: false,
                    decimals: 18,
                    iconUri: null,
                    isVetted: true,
                  },
                  exactAmount: '5',
                  claimableRewards: [],
                },
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const state: ClmmState = {
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
        command: 'cycle',
        task: undefined,
        poolArtifact: undefined,
        operatorInput: undefined,
        onboarding: undefined,
        fundingTokenInput: undefined,
        selectedPool: {
          marketAddress: '0xmarket-current',
          ytSymbol: 'YT-CUR',
          underlyingSymbol: 'USDe',
          apy: 5,
          maturity: '2024-01-01',
        },
        operatorConfig: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
          fundingTokenAddress: '0xusde',
          targetYieldToken: {
            marketAddress: '0xmarket-current',
            ytSymbol: 'YT-CUR',
            underlyingSymbol: 'USDe',
            apy: 5,
            maturity: '2024-01-01',
          },
        },
        setupComplete: true,
        delegationBundle: undefined,
        haltReason: undefined,
        executionError: undefined,
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
        activity: {
          telemetry: [],
          events: [],
        },
        metrics: {
          lastSnapshot: undefined,
          previousApy: undefined,
          cyclesSinceRebalance: 0,
          staleCycles: 0,
          iteration: 0,
          latestCycle: undefined,
        },
        transactionHistory: [],
        delegationsBypassActive: true,
      },
    };

    const command = await pollCycleNode(state, {});
    expect(command).toBeInstanceOf(Command);
    const update = (command as { update?: ClmmUpdate }).update;
    const telemetry = update?.view?.activity?.telemetry?.[0];
    expect(telemetry?.action).toBe('rollover');
    expect(telemetry?.txHash).toBe('0xrolloverhash');
    expect(executeRolloverMock).toHaveBeenCalledTimes(1);
    expect(executeRebalanceMock).not.toHaveBeenCalled();
  });

  it('compounds rewards before considering rebalances', async () => {
    executeCompoundMock.mockResolvedValue({ lastTxHash: '0xcompoundhash' });
    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/tokenizedYield/markets')) {
        return new Response(
          JSON.stringify({
            markets: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-best' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '6.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-best' },
                  name: 'PT-BEST',
                  symbol: 'PT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-best' },
                  name: 'YT-BEST',
                  symbol: 'YT-BEST',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusdai' },
                  name: 'USDai',
                  symbol: 'USDai',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
              },
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-current' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '5.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-cur' },
                  name: 'PT-CUR',
                  symbol: 'PT-CUR',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-cur' },
                  name: 'YT-CUR',
                  symbol: 'YT-CUR',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: '0xusde' },
                  name: 'USDe',
                  symbol: 'USDe',
                  isNative: false,
                  decimals: 6,
                  iconUri: null,
                  isVetted: true,
                },
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokens')) {
        return new Response(
          JSON.stringify({
            tokens: [
              {
                tokenUid: { chainId: '42161', address: '0xusdai' },
                name: 'USDai',
                symbol: 'USDai',
                isNative: false,
                decimals: 18,
                iconUri: null,
                isVetted: true,
              },
              {
                tokenUid: { chainId: '42161', address: '0xusde' },
                name: 'USDe',
                symbol: 'USDe',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tokenizedYield/positions')) {
        return new Response(
          JSON.stringify({
            positions: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-current' },
                pt: {
                  token: {
                    tokenUid: { chainId: '42161', address: '0xpt-cur' },
                    name: 'PT-CUR',
                    symbol: 'PT-CUR',
                    isNative: false,
                    decimals: 18,
                    iconUri: null,
                    isVetted: true,
                  },
                  exactAmount: '100',
                },
                yt: {
                  token: {
                    tokenUid: { chainId: '42161', address: '0xyt-cur' },
                    name: 'YT-CUR',
                    symbol: 'YT-CUR',
                    isNative: false,
                    decimals: 18,
                    iconUri: null,
                    isVetted: true,
                  },
                  exactAmount: '5',
                  claimableRewards: [
                    {
                      token: {
                        tokenUid: { chainId: '42161', address: '0xusde' },
                        name: 'USDe',
                        symbol: 'USDe',
                        isNative: false,
                        decimals: 6,
                        iconUri: null,
                        isVetted: true,
                      },
                      exactAmount: '10',
                    },
                  ],
                },
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const state: ClmmState = {
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
        command: 'cycle',
        task: undefined,
        poolArtifact: undefined,
        operatorInput: undefined,
        onboarding: undefined,
        fundingTokenInput: undefined,
        selectedPool: {
          marketAddress: '0xmarket-current',
          ytSymbol: 'YT-CUR',
          underlyingSymbol: 'USDe',
          apy: 5,
          maturity: '2030-01-01',
        },
        operatorConfig: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
          fundingTokenAddress: '0xusde',
          targetYieldToken: {
            marketAddress: '0xmarket-current',
            ytSymbol: 'YT-CUR',
            underlyingSymbol: 'USDe',
            apy: 5,
            maturity: '2030-01-01',
          },
        },
        setupComplete: true,
        delegationBundle: undefined,
        haltReason: undefined,
        executionError: undefined,
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
        activity: {
          telemetry: [],
          events: [],
        },
        metrics: {
          lastSnapshot: undefined,
          previousApy: undefined,
          cyclesSinceRebalance: 0,
          staleCycles: 0,
          iteration: 0,
          latestCycle: undefined,
        },
        transactionHistory: [],
        delegationsBypassActive: true,
      },
    };

    const command = await pollCycleNode(state, {});
    expect(command).toBeInstanceOf(Command);
    const update = (command as { update?: ClmmUpdate }).update;
    const telemetry = update?.view?.activity?.telemetry?.[0];
    expect(telemetry?.action).toBe('compound');
    expect(telemetry?.txHash).toBe('0xcompoundhash');
    expect(executeCompoundMock).toHaveBeenCalledTimes(1);
    expect(executeRebalanceMock).not.toHaveBeenCalled();
  });
});
