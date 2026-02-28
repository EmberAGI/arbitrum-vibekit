import { describe, expect, it } from 'vitest';

import {
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

  it('returns end target for unknown commands', () => {
    expect(
      resolveCommandTargetForBootstrappedFlow({
        resolvedCommand: 'unknown-command',
        bootstrapped: true,
      }),
    ).toBe('__end__');
  });
});
