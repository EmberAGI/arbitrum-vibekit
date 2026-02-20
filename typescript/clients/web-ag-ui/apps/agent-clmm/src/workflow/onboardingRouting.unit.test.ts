import { describe, expect, it } from 'vitest';

import type { ClmmState } from './context.js';
import { resolveNextOnboardingNode } from './onboardingRouting.js';

function createState(partialView: Partial<ClmmState['view']>): ClmmState {
  return {
    view: partialView,
  } as unknown as ClmmState;
}

describe('resolveNextOnboardingNode', () => {
  it('routes to funding-token collection before operator setup is complete', () => {
    const state = createState({
      poolArtifact: { id: 'camelot-pools' as const },
      operatorInput: {
        poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
        walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
        baseContributionUsd: 10,
      },
      fundingTokenInput: undefined,
      delegationBundle: undefined,
      operatorConfig: undefined,
      delegationsBypassActive: false,
    });

    expect(resolveNextOnboardingNode(state)).toBe('collectFundingTokenInput');
  });

  it('routes to syncState after setup is complete even when funding token input is absent', () => {
    const state = createState({
      poolArtifact: { id: 'camelot-pools' as const },
      operatorInput: {
        poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
        walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
        baseContributionUsd: 10,
      },
      selectedPool: {
        address: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
        token0: { symbol: 'USDC', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
        token1: { symbol: 'WETH', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals: 18 },
        tickSpacing: 10,
      },
      fundingTokenInput: undefined,
      delegationBundle: {
        chainId: 42161,
        delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
        delegatorAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
        delegateeAddress: '0x3fd83e40F96C3c81A807575F959e55C34a40e523',
        delegations: [],
        intents: [],
        descriptions: [],
        warnings: [],
      },
      operatorConfig: {
        walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
        baseContributionUsd: 10,
        autoCompoundFees: true,
        manualBandwidthBps: 125,
      },
      delegationsBypassActive: false,
    });

    expect(resolveNextOnboardingNode(state)).toBe('syncState');
  });
});
