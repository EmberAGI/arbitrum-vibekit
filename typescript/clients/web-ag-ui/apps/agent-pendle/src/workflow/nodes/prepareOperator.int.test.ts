import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getOnchainClients } from '../clientFactory.js';
import type { ClmmState, ClmmUpdate } from '../context.js';

import { prepareOperatorNode } from './prepareOperator.js';

const { executeInitialDepositMock } = vi.hoisted(() => ({
  executeInitialDepositMock: vi.fn(),
}));

vi.mock('../execution.js', () => ({
  executeInitialDeposit: executeInitialDepositMock,
}));

vi.mock('../clientFactory.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    getOnchainClients: vi.fn().mockReturnValue({}),
  };
});

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: vi.fn().mockResolvedValue(undefined),
}));

describe('prepareOperatorNode', () => {
  beforeEach(() => {
    executeInitialDepositMock.mockReset();
    const getOnchainClientsMock = vi.mocked(getOnchainClients);
    getOnchainClientsMock.mockReset();
    getOnchainClientsMock.mockReturnValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PENDLE_SMOKE_MODE;
    delete process.env.PENDLE_TX_EXECUTION_MODE;
  });

  it('executes initial deposit and marks setup complete', async () => {
    executeInitialDepositMock.mockResolvedValue({ lastTxHash: '0xsetuphash' });

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
                tokenUid: { chainId: '42161', address: '0xusdc' },
                name: 'USDC',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
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
            totalItems: 2,
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
        command: undefined,
        task: undefined,
        poolArtifact: undefined,
        operatorInput: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
        },
        onboarding: undefined,
        fundingTokenInput: {
          fundingTokenAddress: '0xusdc',
        },
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

    const result = await prepareOperatorNode(state, {});
    const update = result as ClmmUpdate;

    expect(executeInitialDepositMock).toHaveBeenCalledTimes(1);
    expect(executeInitialDepositMock).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        fundingAmount: '10000000',
      }),
    );
    expect(update.view?.operatorConfig?.walletAddress).toBe(
      '0x0000000000000000000000000000000000000001',
    );
    expect(update.view?.operatorConfig?.executionWalletAddress).toBe(
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(update.view?.selectedPool?.ytSymbol).toBe('YT-BEST');
    expect(update.view?.setupComplete).toBe(true);
  });

  it('skips initial deposit when setup is already complete', async () => {
    executeInitialDepositMock.mockResolvedValue({ lastTxHash: '0xsetuphash' });

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
                tokenUid: { chainId: '42161', address: '0xusdc' },
                name: 'USDC',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
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
            totalItems: 2,
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
        command: undefined,
        task: undefined,
        poolArtifact: undefined,
        operatorInput: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
        },
        onboarding: undefined,
        fundingTokenInput: {
          fundingTokenAddress: '0xusdc',
        },
        selectedPool: undefined,
        operatorConfig: undefined,
        delegationBundle: undefined,
        haltReason: undefined,
        executionError: undefined,
        delegationsBypassActive: true,
        setupComplete: true,
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

    const result = await prepareOperatorNode(state, {});
    const update = result as ClmmUpdate;

    expect(executeInitialDepositMock).not.toHaveBeenCalled();
    expect(update.view?.setupComplete).toBe(true);
    expect(update.view?.selectedPool?.ytSymbol).toBe('YT-BEST');
  });

  it('skips initial deposit and marks setup complete in smoke mode', async () => {
    process.env.PENDLE_SMOKE_MODE = 'true';
    executeInitialDepositMock.mockResolvedValue({ lastTxHash: '0xsetuphash' });

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
                tokenUid: { chainId: '42161', address: '0xusdc' },
                name: 'USDC',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
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
            totalItems: 2,
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
        command: undefined,
        task: undefined,
        poolArtifact: undefined,
        operatorInput: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
        },
        onboarding: undefined,
        fundingTokenInput: {
          fundingTokenAddress: '0xusdc',
        },
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

    const result = await prepareOperatorNode(state, {});
    const update = result as ClmmUpdate;

    expect(executeInitialDepositMock).not.toHaveBeenCalled();
    expect(update.view?.setupComplete).toBe(true);
    expect(update.view?.selectedPool?.ytSymbol).toBe('YT-BEST');
  });

  it('does not require signing key when tx execution mode is plan', async () => {
    process.env.PENDLE_TX_EXECUTION_MODE = 'plan';
    executeInitialDepositMock.mockResolvedValue({ txHashes: [] });

    const getOnchainClientsMock = vi.mocked(getOnchainClients);
    getOnchainClientsMock.mockImplementation(() => {
      throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
    });

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
                tokenUid: { chainId: '42161', address: '0xusdc' },
                name: 'USDC',
                symbol: 'USDC',
                isNative: false,
                decimals: 6,
                iconUri: null,
                isVetted: true,
              },
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
            totalItems: 2,
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
        command: undefined,
        task: undefined,
        poolArtifact: undefined,
        operatorInput: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
        },
        onboarding: undefined,
        fundingTokenInput: {
          fundingTokenAddress: '0xusdc',
        },
        selectedPool: undefined,
        operatorConfig: undefined,
        delegationBundle: undefined,
        haltReason: undefined,
        executionError: undefined,
        delegationsBypassActive: true,
        setupComplete: false,
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

    const result = await prepareOperatorNode(state, {});
    const update = result as ClmmUpdate;

    expect(getOnchainClientsMock).not.toHaveBeenCalled();
    expect(executeInitialDepositMock).toHaveBeenCalledTimes(1);
    expect(executeInitialDepositMock.mock.calls[0]?.[0]).toMatchObject({
      txExecutionMode: 'plan',
      clients: undefined,
    });
    expect(update.view?.setupComplete).toBe(true);
  });

  it('fails when funding token input is missing', async () => {
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
        command: undefined,
        task: undefined,
        poolArtifact: undefined,
        operatorInput: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
        },
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

    const result = await prepareOperatorNode(state, {});
    const update = (result as { update?: ClmmUpdate }).update;
    const haltReason = update?.view?.haltReason ?? '';

    expect(haltReason).toContain('Funding token input missing');
  });

  it('fails when delegation bundle is missing and bypass is disabled', async () => {
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
        command: undefined,
        task: undefined,
        poolArtifact: undefined,
        operatorInput: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
        },
        onboarding: undefined,
        fundingTokenInput: {
          fundingTokenAddress: '0xusdc',
        },
        selectedPool: undefined,
        operatorConfig: undefined,
        delegationBundle: undefined,
        haltReason: undefined,
        executionError: undefined,
        delegationsBypassActive: false,
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

    const result = await prepareOperatorNode(state, {});
    const update = (result as { update?: ClmmUpdate }).update;
    const haltReason = update?.view?.haltReason ?? '';

    expect(haltReason).toContain('Delegation bundle missing');
  });
});
