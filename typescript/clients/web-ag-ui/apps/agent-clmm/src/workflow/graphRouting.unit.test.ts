import { describe, expect, it } from 'vitest';

import type { CamelotPool, OperatorConfigInput, ResolvedOperatorConfig } from '../domain/types.js';

import { createDefaultClmmThreadState, type ClmmState, type DelegationBundle } from './context.js';
import {
  resolvePostCollectDelegations,
  resolvePostFundingTokenInput,
  resolvePostPollCycle,
  resolvePostPrepareOperator,
  resolvePostRunCycle,
} from './graphRouting.js';

const makePool = (): CamelotPool => ({
  address: '0x47c031236e19d024b42f8ae6780e44a573170703',
  token0: {
    address: '0x0000000000000000000000000000000000000001',
    symbol: 'ETH',
    decimals: 18,
    usdPrice: 2000,
  },
  token1: {
    address: '0x0000000000000000000000000000000000000002',
    symbol: 'USDC',
    decimals: 6,
    usdPrice: 1,
  },
  tickSpacing: 10,
  tick: 0,
  liquidity: '1',
});

const makeOperatorInput = (): OperatorConfigInput => ({
  poolAddress: makePool().address,
  walletAddress: '0xbD70792F773a39f88b43d35bb5Aa3d5e098EfeA4',
  baseContributionUsd: 25,
});

const makeOperatorConfig = (): ResolvedOperatorConfig => ({
  walletAddress: '0xbD70792F773a39f88b43d35bb5Aa3d5e098EfeA4',
  baseContributionUsd: 25,
  autoCompoundFees: true,
  manualBandwidthBps: 75,
});

const makeDelegationBundle = (): DelegationBundle => ({
  chainId: 42161,
  delegationManager: '0x3fd83e40f96c3c81a807575f959e55c34a40e523',
  delegatorAddress: '0xbD70792F773a39f88b43d35bb5Aa3d5e098EfeA4',
  delegateeAddress: '0x3fd83e40f96c3c81a807575f959e55c34a40e523',
  delegations: [],
  intents: [],
  descriptions: [],
  warnings: [],
});

const createState = (): ClmmState => ({
  messages: [],
  copilotkit: { actions: [], context: [] },
  settings: { amount: undefined },
  private: {
    mode: undefined,
    pollIntervalMs: 30_000,
    streamLimit: 200,
    cronScheduled: false,
    bootstrapped: true,
  },
  thread: createDefaultClmmThreadState(),
});

const makeOnboardingReadyState = (): ClmmState => {
  const state = createState();
  state.thread.poolArtifact = {} as NonNullable<ClmmState['thread']['poolArtifact']>;
  state.thread.operatorInput = makeOperatorInput();
  state.thread.delegationBundle = makeDelegationBundle();
  state.thread.operatorConfig = makeOperatorConfig();
  state.thread.selectedPool = makePool();
  return state;
};

describe('graphRouting', () => {
  it('routes runCycleCommand to onboarding when prerequisites are missing', () => {
    const state = createState();
    expect(resolvePostRunCycle(state)).toBe('listPools');
  });

  it('routes runCycleCommand to pollCycle once onboarding is complete', () => {
    const state = makeOnboardingReadyState();
    expect(resolvePostRunCycle(state)).toBe('pollCycle');
  });

  it('routes funding-token step toward prepareOperator when onboarding is complete', () => {
    const state = makeOnboardingReadyState();
    expect(resolvePostFundingTokenInput(state)).toBe('prepareOperator');
  });

  it('routes delegation step to summarize when halted', () => {
    const state = createState();
    state.thread.haltReason = 'halted';
    expect(resolvePostCollectDelegations(state)).toBe('summarize');
  });

  it('routes prepareOperator to pollCycle when operator config is ready', () => {
    const state = makeOnboardingReadyState();
    expect(resolvePostPrepareOperator(state)).toBe('pollCycle');
  });

  it('routes prepareOperator back to onboarding when delegation bundle is missing', () => {
    const state = createState();
    state.thread.poolArtifact = {} as NonNullable<ClmmState['thread']['poolArtifact']>;
    state.thread.operatorInput = makeOperatorInput();
    state.thread.fundingTokenInput = {
      fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    };
    expect(resolvePostPrepareOperator(state)).toBe('collectDelegations');
  });

  it('routes pollCycle back to onboarding when required state is missing', () => {
    const state = createState();
    state.thread.poolArtifact = {} as NonNullable<ClmmState['thread']['poolArtifact']>;
    state.thread.operatorInput = makeOperatorInput();
    expect(resolvePostPollCycle(state)).toBe('collectFundingTokenInput');
  });

  it('routes pollCycle to summarize when operator state is valid', () => {
    const state = makeOnboardingReadyState();
    expect(resolvePostPollCycle(state)).toBe('summarize');
  });
});
