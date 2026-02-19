import { describe, expect, it } from 'vitest';

import {
  canStartBackgroundCycle,
  getBackgroundCycleReadiness,
} from './backgroundCycleReadiness.js';

describe('background cycle readiness', () => {
  it('is not ready when no persisted view exists', () => {
    const readiness = getBackgroundCycleReadiness(null);

    expect(readiness).toEqual({
      hasView: false,
      hasOperatorInput: false,
      hasFundingTokenInput: false,
      hasDelegationAccess: false,
      hasOperatorConfig: false,
      isSetupComplete: false,
    });
    expect(canStartBackgroundCycle(null)).toBe(false);
  });

  it('is not ready when setup is incomplete', () => {
    const view = {
      operatorInput: { walletAddress: '0xabc', baseContributionUsd: 10 },
      fundingTokenInput: { fundingTokenAddress: '0xdef' },
      delegationsBypassActive: true,
      operatorConfig: { walletAddress: '0xabc' },
      setupComplete: false,
    };

    expect(canStartBackgroundCycle(view)).toBe(false);
  });

  it('is ready when setup is complete and delegation bypass is active', () => {
    const view = {
      operatorInput: { walletAddress: '0xabc', baseContributionUsd: 10 },
      fundingTokenInput: { fundingTokenAddress: '0xdef' },
      delegationsBypassActive: true,
      operatorConfig: { walletAddress: '0xabc' },
      setupComplete: true,
    };

    expect(canStartBackgroundCycle(view)).toBe(true);
  });

  it('is ready when setup is complete and a delegation bundle exists', () => {
    const view = {
      operatorInput: { walletAddress: '0xabc', baseContributionUsd: 10 },
      fundingTokenInput: { fundingTokenAddress: '0xdef' },
      delegationsBypassActive: false,
      delegationBundle: { delegations: [{ signature: '0xsig' }] },
      operatorConfig: { walletAddress: '0xabc' },
      setupComplete: true,
    };

    expect(canStartBackgroundCycle(view)).toBe(true);
  });
});
