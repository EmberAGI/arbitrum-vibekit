import { describe, expect, it } from 'vitest';

import {
  resolveDelegationContextLabel,
  resolveOnboardingActive,
} from './agentBlockersBehavior';

describe('agentBlockersBehavior', () => {
  it('maps delegation context labels by agent profile', () => {
    expect(resolveDelegationContextLabel('agent-pendle')).toBe('Pendle execution');
    expect(resolveDelegationContextLabel('agent-gmx-allora')).toBe('GMX perps execution');
    expect(resolveDelegationContextLabel('agent-clmm')).toBe('liquidity management');
  });

  it('treats interrupt/input-required as onboarding-active', () => {
    expect(
      resolveOnboardingActive({
        activeInterruptPresent: false,
        taskStatus: 'input-required',
      }),
    ).toBe(true);

    expect(
      resolveOnboardingActive({
        activeInterruptPresent: true,
        taskStatus: 'working',
      }),
    ).toBe(true);
  });

  it('uses explicit onboarding status when present', () => {
    expect(
      resolveOnboardingActive({
        activeInterruptPresent: false,
        taskStatus: 'working',
        onboardingStatus: 'in_progress',
      }),
    ).toBe(true);

    expect(
      resolveOnboardingActive({
        activeInterruptPresent: false,
        taskStatus: 'input-required',
        onboardingStatus: 'completed',
      }),
    ).toBe(false);
  });

  it('does not force onboarding for terminal onboarding states', () => {
    expect(
      resolveOnboardingActive({
        activeInterruptPresent: false,
        taskStatus: 'input-required',
        onboardingStatus: 'failed',
      }),
    ).toBe(false);
    expect(
      resolveOnboardingActive({
        activeInterruptPresent: false,
        taskStatus: 'input-required',
        onboardingStatus: 'canceled',
      }),
    ).toBe(false);
  });
});
