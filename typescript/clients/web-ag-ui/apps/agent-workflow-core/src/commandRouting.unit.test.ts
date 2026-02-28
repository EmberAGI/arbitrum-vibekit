import { describe, expect, it } from 'vitest';

import {
  resolveCommandReplayGuardState,
  resolveCycleCommandTarget,
  resolveCommandTargetForBootstrappedFlow,
  resolveRunCommandForThread,
} from './commandRouting';

describe('commandRouting', () => {
  it('returns explicit sync command without falling back to persisted thread command', () => {
    expect(
      resolveRunCommandForThread({
        parsedCommand: 'sync',
      }),
    ).toBe('sync');
  });

  it('does not fall back to persisted command when no command is parsed', () => {
    expect(
      resolveRunCommandForThread({
        parsedCommand: null,
      }),
    ).toBeUndefined();
  });

  it('uses parsed command when present', () => {
    expect(
      resolveRunCommandForThread({
        parsedCommand: 'fire',
      }),
    ).toBe('fire');
  });

  it('routes standard command targets based on bootstrapped state', () => {
    expect(resolveCommandTargetForBootstrappedFlow({ resolvedCommand: 'hire', bootstrapped: false })).toBe(
      'hireCommand',
    );
    expect(resolveCommandTargetForBootstrappedFlow({ resolvedCommand: 'fire', bootstrapped: false })).toBe(
      'fireCommand',
    );
    expect(resolveCommandTargetForBootstrappedFlow({ resolvedCommand: 'cycle', bootstrapped: false })).toBe(
      'bootstrap',
    );
    expect(resolveCommandTargetForBootstrappedFlow({ resolvedCommand: 'sync', bootstrapped: false })).toBe(
      'bootstrap',
    );
    expect(resolveCommandTargetForBootstrappedFlow({ resolvedCommand: 'sync', bootstrapped: true })).toBe(
      'syncState',
    );
  });

  it('suppresses cycle routing to runCycleCommand while onboarding is not ready', () => {
    expect(
      resolveCycleCommandTarget({
        bootstrapped: false,
        onboardingReady: false,
      }),
    ).toBe('bootstrap');

    expect(
      resolveCycleCommandTarget({
        bootstrapped: true,
        onboardingReady: false,
      }),
    ).toBe('syncState');

    expect(
      resolveCycleCommandTarget({
        bootstrapped: true,
        onboardingReady: true,
      }),
    ).toBe('runCycleCommand');
  });

  it('returns end target for unknown commands', () => {
    expect(
      resolveCommandTargetForBootstrappedFlow({
        resolvedCommand: 'unknown-command',
        bootstrapped: true,
      }),
    ).toBe('__end__');
  });

  it('suppresses replayed non-sync command envelopes when clientMutationId is unchanged', () => {
    expect(
      resolveCommandReplayGuardState({
        parsedCommand: 'cycle',
        clientMutationId: 'cycle-1',
        lastAppliedCommandMutationId: 'cycle-1',
      }),
    ).toEqual({
      suppressDuplicateCommand: true,
      lastAppliedCommandMutationId: 'cycle-1',
    });
  });

  it('does not suppress first-seen non-sync command envelopes and records mutation id', () => {
    expect(
      resolveCommandReplayGuardState({
        parsedCommand: 'hire',
        clientMutationId: 'hire-1',
      }),
    ).toEqual({
      suppressDuplicateCommand: false,
      lastAppliedCommandMutationId: 'hire-1',
    });
  });

  it('ignores replay suppression for sync commands', () => {
    expect(
      resolveCommandReplayGuardState({
        parsedCommand: 'sync',
        clientMutationId: 'sync-1',
        lastAppliedCommandMutationId: 'sync-1',
      }),
    ).toEqual({
      suppressDuplicateCommand: false,
      lastAppliedCommandMutationId: 'sync-1',
    });
  });
});
