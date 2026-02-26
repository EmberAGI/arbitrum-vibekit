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

  it('treats pendle hire run as onboarding in-flight when setup is incomplete', () => {
    expect(
      resolveOnboardingActive({
        agentId: 'agent-pendle',
        activeInterruptPresent: false,
        taskStatus: 'working',
        currentCommand: 'hire',
        setupComplete: false,
      }),
    ).toBe(true);

    expect(
      resolveOnboardingActive({
        agentId: 'agent-gmx-allora',
        activeInterruptPresent: false,
        taskStatus: 'working',
        currentCommand: 'hire',
        setupComplete: false,
      }),
    ).toBe(false);
  });

  it('treats interrupt/input-required as onboarding-active for all agents', () => {
    expect(
      resolveOnboardingActive({
        agentId: 'agent-clmm',
        activeInterruptPresent: true,
        taskStatus: 'working',
        currentCommand: 'idle',
        setupComplete: true,
      }),
    ).toBe(true);

    expect(
      resolveOnboardingActive({
        agentId: 'agent-clmm',
        activeInterruptPresent: false,
        taskStatus: 'input-required',
        currentCommand: 'idle',
        setupComplete: true,
      }),
    ).toBe(true);
  });

  it('keeps onboarding active when lifecycle is explicitly in progress', () => {
    expect(
      resolveOnboardingActive({
        agentId: 'agent-pendle',
        activeInterruptPresent: false,
        taskStatus: 'working',
        currentCommand: 'cycle',
        setupComplete: false,
        onboardingStatus: 'in_progress',
      }),
    ).toBe(true);
  });

  it('does not force onboarding when lifecycle is explicitly completed', () => {
    expect(
      resolveOnboardingActive({
        agentId: 'agent-pendle',
        activeInterruptPresent: false,
        taskStatus: 'working',
        currentCommand: 'cycle',
        setupComplete: true,
        onboardingStatus: 'completed',
      }),
    ).toBe(false);
  });
});
