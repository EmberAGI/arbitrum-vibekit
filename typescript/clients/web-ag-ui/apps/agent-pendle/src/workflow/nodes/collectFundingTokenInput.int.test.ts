import { Command } from '@langchain/langgraph';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClmmState, ClmmUpdate } from '../context.js';

import { collectFundingTokenInputNode } from './collectFundingTokenInput.js';

type InterruptRequest = { options?: Array<{ address: string; symbol: string }> };

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@langchain/langgraph', async () => {
  const actual = await vi.importActual('@langchain/langgraph');
  return {
    ...(actual as Record<string, unknown>),
    interrupt: vi.fn(),
  };
});

describe('collectFundingTokenInputNode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PENDLE_STABLECOIN_WHITELIST;
  });

  it('builds funding token options from wallet balances', async () => {
    process.env.PENDLE_STABLECOIN_WHITELIST = 'USDai,USDC';
    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/wallet/balances/')) {
        return new Response(
          JSON.stringify({
            balances: [
              {
                tokenUid: { chainId: '42161', address: '0xusdai' },
                amount: '100',
                symbol: 'USDai',
                valueUsd: 100,
                decimals: 18,
              },
              {
                tokenUid: { chainId: '42161', address: '0xusdc' },
                amount: '50',
                symbol: 'USDC',
                valueUsd: 50,
                decimals: 6,
              },
              {
                tokenUid: { chainId: '42161', address: '0xeth' },
                amount: '1',
                symbol: 'ETH',
                valueUsd: 2000,
                decimals: 18,
              },
              {
                tokenUid: { chainId: '42161', address: '0xmissing' },
                amount: '10',
                valueUsd: 10,
                decimals: 18,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 4,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const { interrupt } = await import('@langchain/langgraph');
    let captured: InterruptRequest | undefined;
    vi.mocked(interrupt).mockImplementation((request: InterruptRequest) => {
      captured = request;
      return JSON.stringify({ fundingTokenAddress: '0xusdai' });
    });

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

    await collectFundingTokenInputNode(state, {});

    expect(captured?.options?.map((option) => option.symbol)).toEqual(['USDai', 'USDC']);
    expect(captured?.options?.[0]?.address).toBe('0xusdai');
  });

  it('stores the selected funding token and advances onboarding', async () => {
    process.env.PENDLE_STABLECOIN_WHITELIST = 'USDai,USDC';
    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/wallet/balances/')) {
        return new Response(
          JSON.stringify({
            balances: [
              {
                tokenUid: { chainId: '42161', address: '0xusdai' },
                amount: '100',
                symbol: 'USDai',
                valueUsd: 100,
                decimals: 18,
              },
              {
                tokenUid: { chainId: '42161', address: '0xusdc' },
                amount: '50',
                symbol: 'USDC',
                valueUsd: 50,
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

    const { interrupt } = await import('@langchain/langgraph');
    vi.mocked(interrupt).mockImplementation(() =>
      JSON.stringify({ fundingTokenAddress: '0xusdc' }),
    );

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

    const result = await collectFundingTokenInputNode(state, {});

    expect(result).toMatchObject({
      view: {
        fundingTokenInput: { fundingTokenAddress: '0xusdc' },
        onboarding: { step: 3, key: 'delegation-signing' },
      },
    });
  });

  it('auto-selects the funding token when the wallet already has a Pendle position', async () => {
    const MARKET_ADDRESS = '0x00000000000000000000000000000000000000aa';
    const PT_ADDRESS = '0x00000000000000000000000000000000000000bb';
    const YT_ADDRESS = '0x00000000000000000000000000000000000000cc';
    const UNDERLYING_ADDRESS = '0x00000000000000000000000000000000000000dd';

    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/tokenizedYield/positions/')) {
        return new Response(
          JSON.stringify({
            positions: [
              {
                marketIdentifier: { chainId: '42161', address: MARKET_ADDRESS },
                pt: {
                  token: {
                    tokenUid: { chainId: '42161', address: PT_ADDRESS },
                    name: 'PT-sUSDai',
                    symbol: 'PT-sUSDai',
                    isNative: false,
                    decimals: 18,
                    iconUri: null,
                    isVetted: true,
                  },
                  exactAmount: '1',
                },
                yt: {
                  token: {
                    tokenUid: { chainId: '42161', address: YT_ADDRESS },
                    name: 'YT-sUSDai',
                    symbol: 'YT-sUSDai',
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
      if (url.includes('/tokenizedYield/markets')) {
        return new Response(
          JSON.stringify({
            markets: [
              {
                marketIdentifier: { chainId: '42161', address: MARKET_ADDRESS },
                expiry: '2030-01-01',
                details: { impliedApy: 0.1788 },
                ptToken: {
                  tokenUid: { chainId: '42161', address: PT_ADDRESS },
                  name: 'PT-sUSDai',
                  symbol: 'PT-sUSDai',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                ytToken: {
                  tokenUid: { chainId: '42161', address: YT_ADDRESS },
                  name: 'YT-sUSDai',
                  symbol: 'YT-sUSDai',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                underlyingToken: {
                  tokenUid: { chainId: '42161', address: UNDERLYING_ADDRESS },
                  name: 'sUSDai',
                  symbol: 'sUSDai',
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
      return new Response('Not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const { interrupt } = await import('@langchain/langgraph');
    const interruptMock = vi.mocked(interrupt);
    interruptMock.mockReset();

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

    const result = await collectFundingTokenInputNode(state, {});

    expect(interruptMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      view: {
        fundingTokenInput: { fundingTokenAddress: UNDERLYING_ADDRESS },
        selectedPool: { marketAddress: MARKET_ADDRESS, underlyingSymbol: 'sUSDai' },
        onboarding: { step: 2, key: 'delegation-signing' },
      },
    });
  });

  it('reroutes to setup collection when operator input is missing', async () => {
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

    const result = await collectFundingTokenInputNode(state, {});

    expect(result).toBeInstanceOf(Command);
    const commandResult = result as { goto?: string | string[]; update?: ClmmUpdate };
    expect(commandResult.goto).toEqual(expect.arrayContaining(['collectSetupInput']));
    expect(commandResult.update?.view?.haltReason).toBeUndefined();
  });

  it('fails when the selected token is not in allowed options', async () => {
    process.env.PENDLE_STABLECOIN_WHITELIST = 'USDai,USDC';
    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/wallet/balances/')) {
        return new Response(
          JSON.stringify({
            balances: [
              {
                tokenUid: { chainId: '42161', address: '0xusdai' },
                amount: '100',
                symbol: 'USDai',
                valueUsd: 100,
                decimals: 18,
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

    const { interrupt } = await import('@langchain/langgraph');
    vi.mocked(interrupt).mockImplementation(() =>
      JSON.stringify({ fundingTokenAddress: '0xnotallowed' }),
    );

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

    const result = await collectFundingTokenInputNode(state, {});
    expect(result).toBeInstanceOf(Command);
    const update = (result as { update?: ClmmUpdate }).update;
    const haltReason: string | undefined = update?.view?.haltReason;

    expect(haltReason).toContain('not in allowed options');
  });

  it('fails when no eligible stablecoin balances exist', async () => {
    process.env.PENDLE_STABLECOIN_WHITELIST = 'USDai,USDC';
    const fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/wallet/balances/')) {
        return new Response(
          JSON.stringify({
            balances: [
              {
                tokenUid: { chainId: '42161', address: '0xeth' },
                amount: '1',
                symbol: 'ETH',
                valueUsd: 2000,
                decimals: 18,
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

    const { interrupt } = await import('@langchain/langgraph');
    const interruptMock = vi.mocked(interrupt);
    const capturedTypes: string[] = [];
    interruptMock.mockImplementation((request: { type?: string }) => {
      if (request.type) {
        capturedTypes.push(request.type);
      }
      if (request.type === 'pendle-fund-wallet-request') {
        return JSON.stringify({ acknowledged: true });
      }
      return JSON.stringify({ acknowledged: true });
    });

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

    const result = await collectFundingTokenInputNode(state, {});

    // The "fund wallet" interrupt is an ack-only flow. After acknowledgement we end the run
    // and let the UI trigger a new cycle which re-checks balances and proceeds.
    expect(result).toBeInstanceOf(Command);
    const goto = (result as Command<string, ClmmUpdate>).goto;
    expect(Array.isArray(goto) ? goto[0] : goto).toBe('__end__');
    expect(capturedTypes[0]).toBe('pendle-fund-wallet-request');
    expect(capturedTypes).not.toContain('pendle-funding-token-request');
  });
});
