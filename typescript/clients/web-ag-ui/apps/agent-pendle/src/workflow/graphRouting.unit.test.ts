import { describe, expect, it } from 'vitest';

import type { ClmmState } from './context.js';
import {
  resolvePostBootstrap,
  resolvePostCollectDelegations,
  resolvePostFundingTokenInput,
  resolvePostPollCycle,
  resolvePostPrepareOperator,
  resolvePostRunCycle,
} from './graphRouting.js';

const createState = (): ClmmState =>
  ({
    messages: [],
    thread: {
      operatorInput: undefined,
      fundingTokenInput: undefined,
      delegationBundle: undefined,
      delegationsBypassActive: false,
      operatorConfig: undefined,
      setupComplete: false,
      haltReason: undefined,
    },
  }) as unknown as ClmmState;

const makeReadyState = (): ClmmState => {
  const state = createState();
  state.thread.operatorInput = {
    walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
    baseContributionUsd: 10,
  };
  state.thread.fundingTokenInput = {
    fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  };
  state.thread.delegationBundle = {
    chainId: 42161,
    delegationManager: '0xdb9b1e94b5b69df7e401ddbcde43491141047db3',
    delegatorAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
    delegateeAddress: '0x3fd83e40f96c3c81a807575f959e55c34a40e523',
    delegations: [],
    intents: [],
    descriptions: [],
    warnings: [],
  };
  state.thread.operatorConfig = {
    walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
    baseContributionUsd: 10,
    fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
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
  return state;
};

describe('graphRouting', () => {
  it('routes bootstrap to syncState for explicit sync command', () => {
    const state = createState();
    state.messages = [{ id: 'msg-1', role: 'user', content: JSON.stringify({ command: 'sync' }) }];

    expect(resolvePostBootstrap(state)).toBe('syncState');
  });

  it('routes runCycleCommand to onboarding when prerequisites are missing', () => {
    const state = createState();

    expect(resolvePostRunCycle(state)).toBe('collectSetupInput');
  });

  it('routes runCycleCommand to pollCycle once onboarding is complete', () => {
    const state = makeReadyState();

    expect(resolvePostRunCycle(state)).toBe('pollCycle');
  });

  it('routes funding-token step toward prepareOperator when onboarding is complete', () => {
    const state = makeReadyState();

    expect(resolvePostFundingTokenInput(state)).toBe('prepareOperator');
  });

  it('routes delegation step to summarize when halted', () => {
    const state = createState();
    state.thread.haltReason = 'halted';

    expect(resolvePostCollectDelegations(state)).toBe('summarize');
  });

  it('routes prepareOperator to pollCycle when config is ready', () => {
    const state = makeReadyState();

    expect(resolvePostPrepareOperator(state)).toBe('pollCycle');
  });

  it('routes pollCycle back to onboarding when config is missing', () => {
    const state = createState();
    state.thread.operatorInput = {
      walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
      baseContributionUsd: 10,
    };

    expect(resolvePostPollCycle(state)).toBe('collectFundingTokenInput');
  });

  it('routes pollCycle to summarize when operator state is valid', () => {
    const state = makeReadyState();

    expect(resolvePostPollCycle(state)).toBe('summarize');
  });
});
