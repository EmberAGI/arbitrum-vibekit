import { describe, expect, it } from 'vitest';

import {
  resolveCommandTargetForBootstrappedFlow,
  resolveRunCommandForView,
} from './commandRouting';

describe('commandRouting', () => {
  it('keeps current view command when incoming command is sync', () => {
    expect(
      resolveRunCommandForView({
        parsedCommand: 'sync',
        currentViewCommand: 'hire',
      }),
    ).toBe('hire');
  });

  it('uses parsed command when not sync and falls back to current command', () => {
    expect(
      resolveRunCommandForView({
        parsedCommand: 'fire',
        currentViewCommand: 'hire',
      }),
    ).toBe('fire');

    expect(
      resolveRunCommandForView({
        parsedCommand: null,
        currentViewCommand: 'cycle',
      }),
    ).toBe('cycle');
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

  it('returns end target for unknown commands', () => {
    expect(
      resolveCommandTargetForBootstrappedFlow({
        resolvedCommand: 'unknown-command',
        bootstrapped: true,
      }),
    ).toBe('__end__');
  });
});
