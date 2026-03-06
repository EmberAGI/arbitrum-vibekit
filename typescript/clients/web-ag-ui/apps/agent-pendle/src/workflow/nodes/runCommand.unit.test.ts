import { describe, expect, it } from 'vitest';

import type { ClmmState } from '../context.js';

import { resolveCommandTarget, runCommandNode } from './runCommand.js';

const baseState = (): ClmmState => ({
  messages: [],
  copilotkit: { actions: [], context: [] },
  settings: { amount: undefined },
  private: {
    mode: undefined,
    pollIntervalMs: 5_000,
    streamLimit: -1,
    cronScheduled: false,
    bootstrapped: false,
  },
  thread: {
    command: undefined,
    task: undefined,
    poolArtifact: undefined,
    operatorInput: undefined,
    onboarding: undefined,
    fundingTokenInput: undefined,
    selectedPool: undefined,
    operatorConfig: undefined,
    setupComplete: false,
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
});

const message = (command: 'hire' | 'fire' | 'cycle' | 'sync') => ({
  id: 'msg-1',
  role: 'user' as const,
  content: JSON.stringify({ command }),
});

const applyRunCommandUpdate = (state: ClmmState): ClmmState => {
  const update = runCommandNode(state);
  return {
    ...state,
    private: {
      ...state.private,
      ...(update.private ?? {}),
    },
    thread: {
      ...state.thread,
      ...(update.thread ?? {}),
    },
  };
};

describe('resolveCommandTarget', () => {
  it('records lastAppliedClientMutationId when sync command includes one', () => {
    const state = baseState();
    state.messages = [
      {
        id: 'msg-sync',
        role: 'user',
        content: JSON.stringify({ command: 'sync', clientMutationId: 'mutation-1' }),
      },
    ];

    const next = runCommandNode(state);

    expect(next.thread.lastAppliedClientMutationId).toBe('mutation-1');
  });

  it('routes cycle to bootstrap when not bootstrapped', () => {
    const state = baseState();
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('bootstrap');
  });

  it('routes cycle to syncState when bootstrapped but onboarding is incomplete', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('syncState');
  });

  it('routes cycle to syncState when funding token selection is missing', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.thread.operatorInput = { walletAddress: '0xabc', baseContributionUsd: 10 };
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('syncState');
  });

  it('routes cycle to syncState when delegations are required but missing', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.thread.operatorInput = { walletAddress: '0xabc', baseContributionUsd: 10 };
    state.thread.fundingTokenInput = { fundingTokenAddress: '0xdef' as `0x${string}` };
    state.thread.delegationsBypassActive = false;
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('syncState');
  });

  it('routes cycle to syncState when operator config is missing', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.thread.operatorInput = { walletAddress: '0xabc', baseContributionUsd: 10 };
    state.thread.fundingTokenInput = { fundingTokenAddress: '0xdef' as `0x${string}` };
    state.thread.delegationsBypassActive = true;
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('syncState');
  });

  it('routes cycle to syncState when setup is not complete yet', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.thread.operatorInput = { walletAddress: '0xabc', baseContributionUsd: 10 };
    state.thread.fundingTokenInput = { fundingTokenAddress: '0xdef' as `0x${string}` };
    state.thread.delegationsBypassActive = true;
    state.thread.operatorConfig = {
      walletAddress: '0xabc' as `0x${string}`,
      baseContributionUsd: 10,
      fundingTokenAddress: '0xdef' as `0x${string}`,
      targetYieldToken: {
        marketAddress: '0xmarket',
        ptAddress: '0xpt',
        ytAddress: '0xyt',
        ptSymbol: 'PT-USDai-2030',
        maturity: '2030-01-01',
        underlyingSymbol: 'USDai',
        underlyingAddress: '0xusdai',
        ytSymbol: 'YT-USDai-2030',
        apy: 1,
      },
    };
    state.thread.setupComplete = false;
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('syncState');
  });

  it('routes cycle to runCycleCommand when configured and setup complete', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.thread.operatorInput = { walletAddress: '0xabc', baseContributionUsd: 10 };
    state.thread.fundingTokenInput = { fundingTokenAddress: '0xdef' as `0x${string}` };
    state.thread.delegationsBypassActive = true;
    state.thread.operatorConfig = {
      walletAddress: '0xabc' as `0x${string}`,
      baseContributionUsd: 10,
      fundingTokenAddress: '0xdef' as `0x${string}`,
      targetYieldToken: {
        marketAddress: '0xmarket',
        ptAddress: '0xpt',
        ytAddress: '0xyt',
        ptSymbol: 'PT-USDai-2030',
        maturity: '2030-01-01',
        underlyingSymbol: 'USDai',
        underlyingAddress: '0xusdai',
        ytSymbol: 'YT-USDai-2030',
        apy: 1,
      },
    };
    state.thread.setupComplete = true;
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('runCycleCommand');
  });

  it('suppresses replayed non-sync command envelopes with the same clientMutationId', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.thread.operatorInput = { walletAddress: '0xabc', baseContributionUsd: 10 };
    state.thread.fundingTokenInput = { fundingTokenAddress: '0xdef' as `0x${string}` };
    state.thread.delegationsBypassActive = true;
    state.thread.operatorConfig = {
      walletAddress: '0xabc' as `0x${string}`,
      baseContributionUsd: 10,
      fundingTokenAddress: '0xdef' as `0x${string}`,
      targetYieldToken: {
        marketAddress: '0xmarket',
        ptAddress: '0xpt',
        ytAddress: '0xyt',
        ptSymbol: 'PT-USDai-2030',
        maturity: '2030-01-01',
        underlyingSymbol: 'USDai',
        underlyingAddress: '0xusdai',
        ytSymbol: 'YT-USDai-2030',
        apy: 1,
      },
    };
    state.thread.setupComplete = true;
    state.messages = [
      {
        id: 'msg-1',
        role: 'user',
        content: JSON.stringify({ command: 'cycle', clientMutationId: 'cycle-1' }),
      },
    ];

    const first = applyRunCommandUpdate(state);
    expect(resolveCommandTarget(first)).toBe('runCycleCommand');

    const second = applyRunCommandUpdate(first);
    expect(resolveCommandTarget(second)).toBe('__end__');
  });
});
