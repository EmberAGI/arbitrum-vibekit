import { describe, expect, it } from 'vitest';

import type { ClmmState } from '../context.js';

import { resolveCommandTarget } from './runCommand.js';

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
  view: {
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

describe('resolveCommandTarget', () => {
  it('routes cycle to bootstrap when not bootstrapped', () => {
    const state = baseState();
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('bootstrap');
  });

  it('routes cycle to collectSetupInput when bootstrapped but missing operator input', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('collectSetupInput');
  });

  it('routes cycle to collectFundingTokenInput when funding token selection is missing', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.view.operatorInput = { walletAddress: '0xabc', baseContributionUsd: 10 };
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('collectFundingTokenInput');
  });

  it('routes cycle to collectDelegations when delegations are required but missing', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.view.operatorInput = { walletAddress: '0xabc', baseContributionUsd: 10 };
    state.view.fundingTokenInput = { fundingTokenAddress: '0xdef' as `0x${string}` };
    state.view.delegationsBypassActive = false;
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('collectDelegations');
  });

  it('routes cycle to prepareOperator when operator config is missing', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.view.operatorInput = { walletAddress: '0xabc', baseContributionUsd: 10 };
    state.view.fundingTokenInput = { fundingTokenAddress: '0xdef' as `0x${string}` };
    state.view.delegationsBypassActive = true;
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('prepareOperator');
  });

  it('routes cycle to prepareOperator when setup is not complete yet', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.view.operatorInput = { walletAddress: '0xabc', baseContributionUsd: 10 };
    state.view.fundingTokenInput = { fundingTokenAddress: '0xdef' as `0x${string}` };
    state.view.delegationsBypassActive = true;
    state.view.operatorConfig = {
      walletAddress: '0xabc' as `0x${string}`,
      baseContributionUsd: 10,
      fundingTokenAddress: '0xdef' as `0x${string}`,
      targetYieldToken: {
        marketAddress: '0xmarket',
        ptAddress: '0xpt',
        ytAddress: '0xyt',
        maturity: '2030-01-01',
        underlyingSymbol: 'USDai',
        underlyingAddress: '0xusdai',
        ytSymbol: 'YT-USDai-2030',
        apy: 1,
      },
    };
    state.view.setupComplete = false;
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('prepareOperator');
  });

  it('routes cycle to runCycleCommand when configured and setup complete', () => {
    const state = baseState();
    state.private.bootstrapped = true;
    state.view.operatorInput = { walletAddress: '0xabc', baseContributionUsd: 10 };
    state.view.fundingTokenInput = { fundingTokenAddress: '0xdef' as `0x${string}` };
    state.view.delegationsBypassActive = true;
    state.view.operatorConfig = {
      walletAddress: '0xabc' as `0x${string}`,
      baseContributionUsd: 10,
      fundingTokenAddress: '0xdef' as `0x${string}`,
      targetYieldToken: {
        marketAddress: '0xmarket',
        ptAddress: '0xpt',
        ytAddress: '0xyt',
        maturity: '2030-01-01',
        underlyingSymbol: 'USDai',
        underlyingAddress: '0xusdai',
        ytSymbol: 'YT-USDai-2030',
        apy: 1,
      },
    };
    state.view.setupComplete = true;
    state.messages = [message('cycle')];

    expect(resolveCommandTarget(state)).toBe('runCycleCommand');
  });
});
