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
        onboarding: { step: 3 },
      },
    });
  });

  it('fails when operator input is missing', async () => {
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
    const update = (result as { update?: ClmmUpdate }).update;
    const haltReason: string | undefined = update?.view?.haltReason;
    expect(haltReason).toContain('Setup input missing');
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
