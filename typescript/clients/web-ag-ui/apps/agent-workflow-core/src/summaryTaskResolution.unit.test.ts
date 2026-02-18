import { describe, expect, it } from 'vitest';

import { resolveSummaryTaskStatus } from './summaryTaskResolution';

describe('resolveSummaryTaskStatus', () => {
  it('forces failed state when halt reason is present', () => {
    expect(
      resolveSummaryTaskStatus({
        haltReason: 'RPC timeout',
        activeSummaryMessage: 'cycle summarized',
        onboardingCompleteMessage: 'onboarding complete',
      }),
    ).toEqual({
      state: 'failed',
      message: 'RPC timeout',
    });
  });

  it('clears stale delegation input-required state when onboarding is complete', () => {
    expect(
      resolveSummaryTaskStatus({
        currentTaskState: 'input-required',
        currentTaskMessage: 'Waiting for delegation approval to continue onboarding.',
        staleDelegationWaitCleared: true,
        activeSummaryMessage: 'cycle summarized',
        onboardingCompleteMessage: 'Onboarding complete. Strategy is active.',
      }),
    ).toEqual({
      state: 'working',
      message: 'Onboarding complete. Strategy is active.',
    });
  });

  it('preserves non-working task state/message when already terminal-like', () => {
    expect(
      resolveSummaryTaskStatus({
        currentTaskState: 'auth-required',
        currentTaskMessage: 'Please reconnect wallet.',
        activeSummaryMessage: 'cycle summarized',
        onboardingCompleteMessage: 'Onboarding complete. Strategy is active.',
      }),
    ).toEqual({
      state: 'auth-required',
      message: 'Please reconnect wallet.',
    });
  });

  it('defaults to working + summary message otherwise', () => {
    expect(
      resolveSummaryTaskStatus({
        currentTaskState: 'submitted',
        activeSummaryMessage: 'CLMM cycle summarized.',
        onboardingCompleteMessage: 'Onboarding complete. CLMM strategy is active.',
      }),
    ).toEqual({
      state: 'working',
      message: 'CLMM cycle summarized.',
    });
  });
});
