import { describe, expect, it } from 'vitest';

import type { ClmmState } from './context.js';
import {
  resolveNextOnboardingNode,
  resolvePostFundingTokenNode,
} from './onboardingRouting.js';

function createState(overrides?: Partial<ClmmState['thread']>): ClmmState {
  return {
    messages: [],
    thread: {
      profile: {
        chains: [],
        protocols: [],
        tokens: [],
      },
      metrics: {
        iteration: 0,
        cyclesSinceRebalance: 0,
        staleCycles: 0,
      },
      activity: {
        telemetry: [],
        events: [],
      },
      transactionHistory: [],
      ...overrides,
    },
  } as ClmmState;
}

describe('onboardingRouting', () => {
  it('keeps GMX onboarding on the funding-token node until a funding token is selected', () => {
    const state = createState({
      operatorInput: {
        walletAddress: '0x0000000000000000000000000000000000000001',
        targetMarket: 'BTC',
        usdcAllocation: 10,
      },
    });

    expect(resolveNextOnboardingNode(state)).toBe('collectFundingTokenInput');
    expect(resolvePostFundingTokenNode(state)).toBe('collectFundingTokenInput');
  });

  it('advances to delegations after funding-token selection when signing is still required', () => {
    const state = createState({
      operatorInput: {
        walletAddress: '0x0000000000000000000000000000000000000001',
        targetMarket: 'BTC',
        usdcAllocation: 10,
      },
      fundingTokenInput: {
        fundingTokenAddress: '0x0000000000000000000000000000000000000002',
        collateralTokenAddress: '0x0000000000000000000000000000000000000003',
      },
    });

    expect(resolveNextOnboardingNode(state)).toBe('collectDelegations');
    expect(resolvePostFundingTokenNode(state)).toBe('collectDelegations');
  });

  it('advances directly to operator preparation when delegations are bypassed', () => {
    const state = createState({
      delegationsBypassActive: true,
      operatorInput: {
        walletAddress: '0x0000000000000000000000000000000000000001',
        targetMarket: 'BTC',
        usdcAllocation: 10,
      },
      fundingTokenInput: {
        fundingTokenAddress: '0x0000000000000000000000000000000000000002',
        collateralTokenAddress: '0x0000000000000000000000000000000000000003',
      },
    });

    expect(resolveNextOnboardingNode(state)).toBe('prepareOperator');
    expect(resolvePostFundingTokenNode(state)).toBe('prepareOperator');
  });
});
