import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAgentWalletAddress, getOnchainClients } from '../clientFactory.js';
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
    getAgentWalletAddress: vi.fn().mockReturnValue(
      '0x3fd83e40F96C3c81A807575F959e55C34a40e523',
    ),
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
    const getAgentWalletAddressMock = vi.mocked(getAgentWalletAddress);
    getAgentWalletAddressMock.mockReset();
    getAgentWalletAddressMock.mockReturnValue(
      '0x3fd83e40F96C3c81A807575F959e55C34a40e523',
    );
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
                marketIdentifier: { chainId: '42161', address: '0xmarket-expired' },
                expiry: '2000-01-01',
                details: { aggregatedApy: '0.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-legacy' },
                  name: 'PT-LEGACY',
                  symbol: 'PT-LEGACY',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-legacy' },
                  name: 'YT-LEGACY',
                  symbol: 'YT-LEGACY',
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
      thread: {
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
        walletAddress: '0x3fd83e40F96C3c81A807575F959e55C34a40e523',
        fundingAmount: '10000000',
      }),
    );
    expect(update.thread?.operatorConfig?.walletAddress).toBe(
      '0x0000000000000000000000000000000000000001',
    );
    expect(update.thread?.operatorConfig?.executionWalletAddress).toBe(
      '0x3fd83e40F96C3c81A807575F959e55C34a40e523',
    );
    expect(update.thread?.selectedPool?.ytSymbol).toBe('YT-BEST');
    expect(update.thread?.setupComplete).toBe(true);
  });

  it('skips initial deposit when wallet holds PT balance even if positions endpoint is empty', async () => {
    executeInitialDepositMock.mockResolvedValue({ lastTxHash: '0xsetuphash' });

    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/tokenizedYield/markets')) {
        return new Response(
          JSON.stringify({
            markets: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-expired' },
                expiry: '2000-01-01',
                details: { aggregatedApy: '0.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-legacy' },
                  name: 'PT-LEGACY',
                  symbol: 'PT-LEGACY',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-legacy' },
                  name: 'YT-LEGACY',
                  symbol: 'YT-LEGACY',
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
      if (url.includes('/wallet/balances/0x0000000000000000000000000000000000000001')) {
        return new Response(
          JSON.stringify({
            balances: [
              {
                tokenUid: { chainId: '42161', address: '0xpt-legacy' },
                amount: '10000000000000000000',
                symbol: 'PT-sUSDai-19FEB2026',
                valueUsd: 10,
                decimals: 18,
              },
              {
                tokenUid: { chainId: '42161', address: '0xusdc' },
                amount: '7000000',
                symbol: 'USDC',
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
      thread: {
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
    expect(update.thread?.setupComplete).toBe(true);
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
      thread: {
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
    expect(update.thread?.setupComplete).toBe(true);
    expect(update.thread?.selectedPool?.ytSymbol).toBe('YT-BEST');
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
      thread: {
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
    expect(update.thread?.setupComplete).toBe(true);
    expect(update.thread?.selectedPool?.ytSymbol).toBe('YT-BEST');
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
      thread: {
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
    expect(update.thread?.setupComplete).toBe(true);
  });

  it('fails early when funding token balance is below the configured initial deposit amount', async () => {
    process.env.PENDLE_TX_EXECUTION_MODE = 'execute';
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
      if (url.includes('/wallet/balances/0x0000000000000000000000000000000000000001')) {
        return new Response(
          JSON.stringify({
            balances: [
              {
                tokenUid: { chainId: '42161', address: '0xusdc' },
                amount: '5000000',
                symbol: 'USDC',
                valueUsd: 5,
                decimals: 6,
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
      thread: {
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
    const update = (result as { update?: ClmmUpdate }).update;
    const failureMessage = update?.thread?.task?.taskStatus?.message?.content ?? '';

    expect(executeInitialDepositMock).not.toHaveBeenCalled();
    expect(failureMessage).toContain('ERROR: Insufficient USDC balance for initial deposit');
    expect(failureMessage).toContain('required=10');
    expect(failureMessage).toContain('available=5');
  });

  it('counts expired PT liquidity and only tops up the shortfall from funding token balance', async () => {
    process.env.PENDLE_TX_EXECUTION_MODE = 'execute';
    executeInitialDepositMock.mockResolvedValue({ lastTxHash: '0xsetuphash' });

    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/tokenizedYield/markets')) {
        return new Response(
          JSON.stringify({
            markets: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-expired' },
                expiry: '2000-01-01',
                details: { aggregatedApy: '0.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-expired' },
                  name: 'PT-EXPIRED',
                  symbol: 'PT-EXPIRED',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-expired' },
                  name: 'YT-EXPIRED',
                  symbol: 'YT-EXPIRED',
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
                marketIdentifier: { chainId: '42161', address: '0xmarket-active' },
                expiry: '2030-01-01',
                details: { aggregatedApy: '6.0' },
                ptToken: {
                  tokenUid: { chainId: '42161', address: '0xpt-active' },
                  name: 'PT-ACTIVE',
                  symbol: 'PT-ACTIVE',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: '0xyt-active' },
                  name: 'YT-ACTIVE',
                  symbol: 'YT-ACTIVE',
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
      if (url.includes('/tokenizedYield/positions')) {
        return new Response(
          JSON.stringify({
            positions: [
              {
                marketIdentifier: { chainId: '42161', address: '0xmarket-expired' },
                pt: {
                  token: {
                    tokenUid: { chainId: '42161', address: '0xpt-expired' },
                    name: 'PT-EXPIRED',
                    symbol: 'PT-EXPIRED',
                    isNative: false,
                    decimals: 18,
                    iconUri: null,
                    isVetted: true,
                  },
                  exactAmount: '8000000000000000000',
                },
                yt: {
                  token: {
                    tokenUid: { chainId: '42161', address: '0xyt-expired' },
                    name: 'YT-EXPIRED',
                    symbol: 'YT-EXPIRED',
                    isNative: false,
                    decimals: 18,
                    iconUri: null,
                    isVetted: true,
                  },
                  exactAmount: '0',
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
      if (url.includes('/wallet/balances/0x0000000000000000000000000000000000000001')) {
        return new Response(
          JSON.stringify({
            balances: [
              {
                tokenUid: { chainId: '42161', address: '0xpt-expired' },
                amount: '8000000000000000000',
                symbol: 'PT-EXPIRED',
                valueUsd: 8,
                decimals: 18,
              },
              {
                tokenUid: { chainId: '42161', address: '0xusdc' },
                amount: '3000000',
                symbol: 'USDC',
                valueUsd: 3,
                decimals: 6,
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
      thread: {
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

    expect(executeInitialDepositMock).toHaveBeenCalledTimes(1);
    expect(executeInitialDepositMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fundingAmount: '2000000',
      }),
    );
    expect(update.thread?.setupComplete).toBe(true);
  });

  it('reroutes to funding token collection when funding token input is missing', async () => {
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
      thread: {
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
    const commandResult = result as {
      goto?: string | string[];
      update?: ClmmUpdate;
    };
    const update = commandResult.update;
    const nextTaskState = update?.thread?.task?.taskStatus?.state;

    expect(nextTaskState).toBe('input-required');
    expect(commandResult.goto).toEqual(expect.arrayContaining(['collectFundingTokenInput']));
    expect(update?.thread?.haltReason).toBeUndefined();
    expect(
      update?.thread?.operatorInput as { walletAddress?: string; baseContributionUsd?: number } | undefined,
    ).toEqual(
      expect.objectContaining({
        walletAddress: '0x0000000000000000000000000000000000000001',
        baseContributionUsd: 10,
      }),
    );
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
      thread: {
        command: undefined,
        task: undefined,
        poolArtifact: undefined,
        operatorInput: {
          walletAddress: '0x0000000000000000000000000000000000000001',
          baseContributionUsd: 10,
        },
        onboarding: {
          step: 2,
          key: 'funding-token',
        },
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
    const nextTaskState = update?.thread?.task?.taskStatus?.state;
    const nextTaskMessage = update?.thread?.task?.taskStatus?.message?.content;

    expect(nextTaskState).toBe('input-required');
    expect(nextTaskMessage).toBe('Waiting for delegation approval to continue onboarding.');
    expect(update?.thread?.onboarding).toEqual({
      step: 3,
      key: 'delegation-signing',
    });
    expect(
      update?.thread?.operatorInput as { walletAddress?: string; baseContributionUsd?: number } | undefined,
    ).toEqual(
      expect.objectContaining({
        walletAddress: '0x0000000000000000000000000000000000000001',
        baseContributionUsd: 10,
      }),
    );
    expect(
      update?.thread?.fundingTokenInput as { fundingTokenAddress?: string } | undefined,
    ).toEqual(
      expect.objectContaining({
        fundingTokenAddress: '0xusdc',
      }),
    );
  });
});
